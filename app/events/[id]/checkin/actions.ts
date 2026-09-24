'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireStaff, canManageEvent } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode, generateRegistrationCode } from '@/lib/registrationCode';
import { rateLimitBySession } from '@/lib/rateLimit';
import { computeLifecycle, walkInClosedMessage, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import {
  awardAttendanceCredit,
  type AwardOutcome,
} from '@/lib/cpd/awardAttendanceCredit';

/** Operator-facing summary of the post-check-in credit attempt (ids only). */
export type CreditSummary = {
  /** True when at least one body issued a fresh credit. */
  anyIssued: boolean;
  /** True when every evaluated body skipped or the whole call failed. */
  allSkipped: boolean;
  /** Short human lines for the door toast — never PII. */
  lines: string[];
};

function summariseCredit(outcomes: AwardOutcome[]): CreditSummary {
  const lines: string[] = [];
  let anyIssued = false;
  let anyPositive = false;

  for (const o of outcomes) {
    if (o.status === 'issued') {
      anyIssued = true;
      anyPositive = true;
      lines.push('CPD credit issued');
    } else if (o.status === 'already') {
      anyPositive = true;
      lines.push('CPD credit already on record');
    } else if (o.status === 'skipped') {
      const reason = o.reason;
      if (reason === 'not_cpd') {
        // Non-accredited event — silence is correct; no line.
      } else if (reason === 'no_licence') {
        lines.push('CPD held — attendee has no licence for this body');
      } else if (reason === 'no_role_match') {
        lines.push('No CPD credit — role not mapped for this body');
      } else if (reason === 'disabled') {
        lines.push('CPD issuance is disabled on this environment');
      } else if (reason === 'outside_window') {
        lines.push('No CPD credit — outside the attendance window');
      } else if (reason === 'cancelled') {
        lines.push('No CPD credit — registration cancelled');
      } else if (reason === 'no_registration') {
        lines.push('No CPD credit — no registration for this code');
      } else if (reason === 'registration_unlinked') {
        // F5 fail. Walk-in / guest waiting to claim. Recovery = attendee
        // signs up with the registration email, then reconcile releases.
        lines.push('CPD held — attendee will link account after the event');
      } else if (reason === 'email_unverified') {
        // F1 fail. Recovery = attendee verifies via the Supabase email.
        lines.push('CPD held — attendee must verify their email');
      } else if (reason === 'missing_consents') {
        // F2 fail. Recovery = attendee accepts current terms + privacy.
        lines.push('CPD held — attendee has not accepted current terms');
      } else if (reason === 'profile_incomplete') {
        // F3 fail. Recovery = attendee fills workplace / position / profession.
        lines.push('CPD held — attendee must complete their profile');
      } else if (reason === 'no_occurrences' || reason === 'no_matching_schedule') {
        lines.push('No CPD credit — no matching session credit');
      } else if (reason === 'zero_earned' || reason === 'no_attendance') {
        lines.push('No CPD credit — zero attendance points earned');
      } else if (reason === 'no_user') {
        // Pre-Stage-B4 code path. Under enforce_full_setup=true (the app
        // default) F5 (registration_unlinked) now fires first for unlinked
        // registrations; no_user only reaches this branch under
        // enforce_full_setup=false (reconcile scripts). Kept for
        // completeness of legacy reconcile output.
        lines.push('No CPD credit — no auth user matched the registration email');
      } else {
        lines.push(`No CPD credit — ${reason}`);
      }
    } else if (o.status === 'failed') {
      lines.push('CPD credit failed to post — will need reconcile');
    }
  }

  // De-dupe identical lines when multi-body returns the same skip twice.
  const unique = [...new Set(lines)];
  return {
    anyIssued,
    allSkipped: !anyPositive && unique.length > 0,
    lines: unique,
  };
}

/**
 * Mark a registrant as attended by their registration_code.
 *
 * Delegates to the `mark_attended` SECURITY DEFINER DB function (CPD
 * Sprint 2 / Task 11), which is atomic (check-and-update in one
 * statement) and audited (`attendee_checked_in`, via 'staff_scan').
 *
 * Three-layer auth preserved as defense-in-depth: middleware (proxy.ts) →
 * requireStaff() here → app_private.require_active_staff() inside the DB
 * function. The definer bypasses RLS entirely, so the in-function
 * org check (event.organisation_id = actor.organisation_id) is now the
 * SOLE enforcement of org-scoped check-in. Non-members
 * get the same 'not_recognised' a nonexistent code would return —
 * info-hiding by design, preserved exactly from the pre-conversion RLS
 * behavior.
 *
 * Idempotent: a second writer for the same code returns
 * { error: 'Already attended.', alreadyAttendedAt } rather than silently
 * re-stamping check_in_at (CLAUDE.md rule 12).
 *
 * NEW in this conversion (not a preserved behavior): a per-event rate
 * limit (600/min) inside the DB function. The original action had none.
 *
 * Credit summary (2026-08-20): after a fresh check-in the award outcomes are
 * returned for the door toast. Attendance is still authoritative — a credit
 * failure never changes the ok/error branch of this response.
 */
export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<
  | {
      ok: true;
      registration: { id: string; full_name: string; event_id: string; event_title: string };
      credit?: CreditSummary;
    }
  | { error: string; alreadyAttendedAt?: string }
> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  // p_actor_override: inert for a real session, makes this callable under
  // review mode too — see 20260814020000.
  const { data, error } = await supabase.rpc('mark_attended', {
    p_code: code,
    p_method: method,
    p_actor_override: staff.id,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  switch (row?.result) {
    case 'ok': {
      // Fresh check-in → award a CPD credit (best-effort, decoupled). award_attendance_credit
      // is service_role-only, so it needs the admin client (not the staff-scoped one).
      // Attendance is authoritative — a credit failure must never change this response,
      // so EVERYTHING credit-related lives inside this try: supabaseAdmin() reads
      // process.env with non-null assertions and throws on a misconfigured deploy,
      // which outside the boundary would fail an already-committed check-in.
      let credit: CreditSummary | undefined;
      try {
        // Attribution only. A failed getUser() degrades actorId to NULL, which
        // award_attendance_credit already handles with a raise warning rather
        // than costing the practitioner a credit (DEFERRED, MEDIUM-4).
        // Surfacing it would fail an attendance that is already committed —
        // exactly what this try block exists to prevent.
        // eslint-disable-next-line no-restricted-syntax -- see above: attribution degrades to NULL by design
        const { data: actor } = await supabase.auth.getUser();
        const outcomes = await awardAttendanceCredit(supabaseAdmin(), {
          eventId: row.event_id,
          registrationCode: code,
          // The scanning staff member's auth user id — credit_ledger.actor_id
          // references public.users(id), NOT staff.id (they are unrelated uuids).
          actorId: actor?.user?.id ?? null,
        });
        credit = summariseCredit(outcomes);
      } catch {
        console.error('[cpd] award threw after staff mark-attended', { eventId: row.event_id });
        credit = {
          anyIssued: false,
          allSkipped: true,
          lines: ['CPD credit failed to post — will need reconcile'],
        };
      }
      revalidatePath(`/events/${row.event_id}/checkin`);
      return {
        ok: true,
        registration: {
          id: row.registration_id,
          full_name: row.full_name,
          event_id: row.event_id,
          event_title: row.event_title,
        },
        credit,
      };
    }
    case 'already':
      return { error: 'Already attended.', alreadyAttendedAt: row.check_in_at ?? undefined };
    case 'rate_limited':
      return { error: 'Too many attempts. Please try again in a moment.' };
    // Added with the staff door's lifecycle guards (20260804030000). Before
    // those, a cancelled registration was checked in and earned a real CPD
    // credit; now it is refused, and the operator needs to know WHY so they can
    // act — "Code not recognised" would send them to re-scan a valid badge.
    case 'cancelled':
      return { error: 'This registration was cancelled — it can’t be checked in. Re-register the attendee first.' };
    case 'unavailable':
      return { error: 'This event isn’t accepting check-ins (it isn’t published, or it was deleted).' };
    case 'no_matching_occurrence':
      // Multi-occurrence events only: no session/day matches this check-in
      // time. Distinct from the default — the code IS recognised.
      return { error: 'No matching session for this check-in time — check the event schedule.' };
    default:
      return { error: 'Code not recognised.' };
  }
}

const walkInSchema = z.object({
  eventId: z.string().uuid(),
  fullName: z.string().trim().min(1, 'Name required').max(100),
  email: z.string().trim().toLowerCase().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Invalid email'),
});

/**
 * Staff-side walk-in: register a person at the door and check them in
 * immediately. Skips the registration window check (the person is physically
 * present) and skips the confirmation email (they're at the desk).
 */
export async function walkInRegisterAndCheckIn(input: {
  eventId: string;
  fullName: string;
  email: string;
}): Promise<
  | { ok: true; registration: { full_name: string; code: string }; credit?: CreditSummary }
  | { error: string }
> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const { eventId, fullName, email } = parsed.data;

  const limit = await rateLimitBySession('staff.walkin', staff.id, { windowMs: 60_000, max: 60 });
  if (!limit.allowed) return { error: 'Too many walk-in attempts. Please wait a moment.' };

  const admin = supabaseAdmin();

  const { data: event, error: eventErr } = await admin
    .from('events')
    .select('id, title, status, max_attendees, organisation_id, deleted_at, start_time, end_time, registration_close_at, registration_open_at')
    .eq('id', eventId)
    .maybeSingle();

  if (eventErr) return { error: 'Could not load event.' };
  if (!event || event.deleted_at != null) {
    return { error: 'This event is not available for walk-in registration.' };
  }
  // Gate on the DERIVED lifecycle, not the raw status column: pg_cron
  // (Stage 8, deferred) never flips status to 'completed' automatically, so
  // a `status !== 'published'` check alone never catches an event that has
  // simply run past its end_time — it stays 'published' forever. Every
  // other status-derived surface on this page (the Scoreboard) already
  // reads the same computeLifecycle() value, so this keeps the walk-in
  // gate honest with what the door screen visibly says.
  const lifecycle = computeLifecycle(event as EventLifecycleRow, Date.now());
  const closedMessage = walkInClosedMessage(lifecycle);
  if (closedMessage) return { error: closedMessage };

  if (!canManageEvent(event, staff)) {
    return { error: 'You do not have access to this event.' };
  }

  if (event.max_attendees != null) {
    const { count } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if ((count ?? 0) >= event.max_attendees) {
      return { error: 'This event is at capacity.' };
    }
  }

  // Register with code-collision retry (same pattern as registerForEvent).
  // source: 'walk_in' is set EXPLICITLY (2026-09-24, Ivan): the column
  // default is 'self_registration', so omitting the field previously wrote
  // every walk-in as if the attendee had self-registered — a lie about
  // provenance the whole downstream chain (audit, exports, credit release)
  // trusts. The label describes the attendee's pathway (they walked in on
  // the day), NOT who typed the keys — staff typing at the door on the
  // attendee's behalf is still, from the attendee's perspective, a walk-in.
  // Actor stratification (who typed it, whether it was a VIP/exception)
  // lives in audit metadata, never in this enum (Ivan's "one clean pathway
  // vocabulary, no bloat" call). The column is set-at-insert-only per the
  // registrations_link_columns_immutable_from_client trigger, so this is
  // the one and only chance to record it honestly.
  let reg: { id: string; registration_code: string } | null = null;
  let regErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRegistrationCode();
    const result = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email,
        full_name: fullName,
        registration_code: candidate,
        source: 'walk_in',
      })
      .select('id, registration_code')
      .single();
    if (result.error) {
      if (result.error.code === '23505' && result.error.message.includes('registrations_code_unique')) {
        continue;
      }
      regErr = result.error;
      break;
    }
    reg = result.data;
    break;
  }

  if (!reg) {
    if (regErr?.code === '23505' && regErr.message.includes('registrations_event_id_email_key')) {
      return { error: 'This email is already registered. Use code entry to check them in.' };
    }
    return { error: 'Walk-in registration failed. Please try again.' };
  }

  // Record the deliberate email skip (Hard Rule 12: fail visibly, not silently)
  const { error: emailLogErr } = await admin.from('email_log').insert({
    purpose: 'confirmation',
    event_id: eventId,
    recipient_email: email,
    registration_id: reg.id,
    status: 'skipped',
  });
  if (emailLogErr) console.error('[walk-in] email_log insert failed', { regId: reg.id });

  // Check them in via the existing path
  const attended = await markAttended(reg.registration_code, 'manual');

  revalidatePath(`/events/${eventId}/checkin`);

  if ('ok' in attended) {
    return {
      ok: true,
      registration: { full_name: fullName, code: reg.registration_code },
      credit: attended.credit,
    };
  }
  return attended;
}
