'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { getClientIp } from '@/lib/rateLimit';
import { awardAttendanceCredit } from '@/lib/cpd/awardAttendanceCredit';

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
): Promise<{ ok: true; eventId: string } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();
  const ip = await getClientIp();
  const { data, error } = await admin.rpc('self_check_in', { p_code: code, p_ip: ip });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data; // set-returning fn
  switch (row?.result) {
    case 'ok':
      // Fresh check-in → award a CPD credit (best-effort, decoupled). Attendance
      // is authoritative: a credit failure must never change this response
      // (Runtime Contract). The wrapper handles business/technical outcomes
      // internally; this try/catch is the serverless backstop for an unexpected throw.
      try {
        await awardAttendanceCredit(admin, { eventId: row.event_id, registrationCode: code });
      } catch {
        console.error('[cpd] award threw after self check-in', { eventId: row.event_id });
      }
      revalidatePath('/checkin/confirm');
      return { ok: true, eventId: row.event_id };
    case 'already':
      return { error: "You're already checked in." };
    case 'rate_limited':
      return { error: 'Too many attempts. Please try again in a moment.' };
    // The lifecycle refusals (DEFERRED 57). Each gets its own copy because
    // each implies a different action for someone standing at a door: wait,
    // find a staff member, or stop trying. Collapsing them into the generic
    // default told an attendee their registration was invalid when it was
    // perfectly valid and merely early.
    case 'not_open':
      return { error: "Check-in isn't open yet. It opens an hour before the event starts." };
    case 'self_serve_off':
      return { error: "Self check-in isn't enabled for this event — please see reception." };
    case 'cancelled':
      return { error: 'This registration was cancelled.' };
    case 'unavailable':
      return { error: "This event isn't accepting check-ins." };
    default:
      return { error: 'This registration is no longer valid.' };
  }
}
