'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { awardAttendanceCredit } from '@/lib/cpd/awardAttendanceCredit';

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
 */
export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<
  | { ok: true; registration: { id: string; full_name: string; event_id: string; event_title: string } }
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
      try {
        // Attribution only. A failed getUser() degrades actorId to NULL, which
        // award_attendance_credit already handles with a raise warning rather
        // than costing the practitioner a credit (DEFERRED, MEDIUM-4).
        // Surfacing it would fail an attendance that is already committed —
        // exactly what this try block exists to prevent.
        // eslint-disable-next-line no-restricted-syntax -- see above: attribution degrades to NULL by design
        const { data: actor } = await supabase.auth.getUser();
        await awardAttendanceCredit(supabaseAdmin(), {
          eventId: row.event_id,
          registrationCode: code,
          // The scanning staff member's auth user id — credit_ledger.actor_id
          // references public.users(id), NOT staff.id (they are unrelated uuids).
          actorId: actor?.user?.id ?? null,
        });
      } catch {
        console.error('[cpd] award threw after staff mark-attended', { eventId: row.event_id });
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
    default:
      return { error: 'Code not recognised.' };
  }
}
