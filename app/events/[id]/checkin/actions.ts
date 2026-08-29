'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
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
 * owner check (event.created_by = actor.id) is now the SOLE enforcement
 * of owner-exclusive check-in (Q19 / 2026-06-02, reverses Q4). Non-owners
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
