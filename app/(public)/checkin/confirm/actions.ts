'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * Public self-checkin via the personal QR URL /checkin/confirm?code=WK-XXXX.
 *
 * No auth — the code IS the bearer token. Delegates to the `self_check_in`
 * SECURITY DEFINER DB function (CPD Sprint 2 / A1+P3), which does the
 * idempotent UPDATE + rate-limit + audit write atomically inside one
 * transaction. Rate limiting is per-event (not per-IP) inside that function
 * — many attendees checking in from behind one venue NAT'd IP must not
 * share a limit (see the migration's header comment).
 */
export async function selfCheckIn(
  code: string,
): Promise<{ ok: true; eventId: string } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('self_check_in', { p_code: code });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data; // set-returning fn
  switch (row?.result) {
    case 'ok':
      revalidatePath('/checkin/confirm');
      return { ok: true, eventId: row.event_id };
    case 'already':
      return { error: "You're already checked in." };
    case 'rate_limited':
      return { error: 'Too many attempts. Please try again in a moment.' };
    default:
      return { error: 'This registration is no longer valid.' };
  }
}
