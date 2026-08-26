'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { getClientIp } from '@/lib/rateLimit';
import {
  awardAttendanceCredit,
  type AwardOutcome,
} from '@/lib/cpd/awardAttendanceCredit';

/**
 * Attendee-facing summary of the post-check-in credit attempt.
 *
 * Deliberately narrower than the staff `CreditSummary` in
 * `app/events/[id]/checkin/actions.ts`. The attendee is not the operator:
 * the engine's internal skip reasons (no_role_match, no_licence, …) name a
 * server-side condition they cannot act on and, in a multi-body event, would
 * describe some *other* attendee's account state as often as their own.
 * Rule 12 (fail visibly, not silently) still binds: a check-in that posted no
 * credit for a reason the attendee can act on must be surfaced — the wording
 * just points to reception, which is exactly the escalation path the staff
 * roster serves internally.
 *
 * Three states:
 *   - 'posted'   at least one body issued or already had the credit on record
 *   - 'missing'  every evaluated body skipped/failed for a non-`not_cpd` reason
 *   - undefined  either not a CPD event at all (`not_cpd` only) or nothing to say
 */
export type AttendeeCredit = { kind: 'posted' } | { kind: 'missing' };

function summariseCreditForAttendee(
  outcomes: AwardOutcome[],
): AttendeeCredit | undefined {
  let anyPositive = false;
  let anyMissing = false;
  for (const o of outcomes) {
    if (o.status === 'issued' || o.status === 'already') {
      anyPositive = true;
    } else if (o.status === 'failed') {
      anyMissing = true;
    } else if (o.status === 'skipped' && o.reason !== 'not_cpd') {
      // `not_cpd` is silence by design (no accreditation groups on this event
      // — the attendee did not expect credit). Every other skip reason is a
      // real signal the attendee should follow up on with staff.
      anyMissing = true;
    }
  }
  if (anyPositive) return { kind: 'posted' };
  if (anyMissing) return { kind: 'missing' };
  return undefined;
}

/**
 * Public self-checkin via the personal QR URL /checkin/confirm?code=WK-XXXX.
 *
 * No auth — the code IS the bearer token. Delegates to the `self_check_in`
 * SECURITY DEFINER DB function (CPD Sprint 2 / A1+P3), which does the
 * idempotent UPDATE + rate-limit + audit write atomically inside one
 * transaction. Rate limiting is per-event (not per-IP) for VALID codes —
 * many attendees checking in from behind one venue NAT'd IP must not share
 * a limit. The caller's IP is still passed through for the invalid-code
 * (guessing) path specifically: an invalid code never resolves to an event,
 * so per-event keying can't apply there, and that path had NO rate limit at
 * all until this fix — see the migration's header comment.
 */
export async function selfCheckIn(
  code: string,
): Promise<{ ok: true; eventId: string; credit?: AttendeeCredit } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();
  const ip = await getClientIp();
  const { data, error } = await admin.rpc('self_check_in', { p_code: code, p_ip: ip });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data; // set-returning fn
  switch (row?.result) {
    case 'ok': {
      // Fresh check-in → award a CPD credit (best-effort, decoupled). Attendance
      // is authoritative: a credit failure must never change this response
      // (Runtime Contract). The wrapper handles business/technical outcomes
      // internally; this try/catch is the serverless backstop for an unexpected throw.
      let credit: AttendeeCredit | undefined;
      try {
        const outcomes = await awardAttendanceCredit(admin, {
          eventId: row.event_id,
          registrationCode: code,
        });
        credit = summariseCreditForAttendee(outcomes);
      } catch {
        console.error('[cpd] award threw after self check-in', { eventId: row.event_id });
        // A thrown award is a `missing` outcome from the attendee's POV —
        // check-in succeeded, they should see a note pointing at reception.
        credit = { kind: 'missing' };
      }
      revalidatePath('/checkin/confirm');
      return { ok: true, eventId: row.event_id, credit };
    }
    case 'already':
      return { error: "You're already checked in." };
    case 'rate_limited':
      return { error: 'Too many attempts. Please try again in a moment.' };
    // The lifecycle refusals (DEFERRED 57). Each gets its own copy because
    // each implies a different action for someone standing at a door: wait,
    // find a staff member, or stop trying. Collapsing them into the generic
    // default told an attendee their registration was invalid when it was
    // perfectly valid and merely early.
    case 'not_open_yet':
      return { error: "Check-in isn't open yet. It opens an hour before the event starts." };
    case 'closed':
      // Distinct from not_open_yet on purpose: telling someone who arrived
      // late to "wait" sends them to a moment that has already passed, and
      // nothing would ever correct them.
      return { error: 'Check-in for this event has closed. Please see a member of staff.' };
    case 'self_serve_off':
      return { error: "Self check-in isn't enabled for this event — please see reception." };
    case 'cancelled':
      return { error: 'This registration was cancelled.' };
    case 'unavailable':
      return { error: "This event isn't accepting check-ins." };
    case 'no_matching_occurrence':
      // Multi-occurrence events only: no session/day matches this check-in
      // time. Distinct from the generic default — the code IS valid.
      return { error: 'No matching session found for this check-in time. Please see a member of staff.' };
    default:
      return { error: 'This registration is no longer valid.' };
  }
}
