'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { rateLimitByIp } from '@/lib/rateLimit';

/**
 * Public self-checkin via the personal QR URL /checkin/confirm?code=WK-XXXX.
 *
 * No auth — the code IS the bearer token. Admin client because anon has no
 * UPDATE policy on registrations. The WHERE status != 'attended' clause
 * makes the action idempotent so re-tapping the link doesn't re-stamp.
 *
 * Mirrors markAttended's idempotency pattern but with method='qr' hard-coded
 * (self-checkin always counts as QR — the attendee got here via their
 * personal QR URL).
 */
export async function selfCheckIn(
  code: string,
): Promise<{ ok: true; eventId: string } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  // Brute-force defense: cap per-IP attempts before doing any DB work.
  // 10/min is generous for one attendee re-clicking after errors; way below
  // what an attacker iterating codes would need.
  const limit = await rateLimitByIp('selfCheckIn', { windowMs: 60_000, max: 10 });
  if (!limit.allowed) return { error: 'Too many attempts. Please try again in a moment.' };

  const admin = supabaseAdmin();
  const { data: updated, error } = await admin
    .from('registrations')
    .update({
      status: 'attended',
      check_in_at: new Date().toISOString(),
      check_in_method: 'qr',
    })
    .eq('registration_code', code)
    .neq('status', 'attended')
    .select('id, event_id')
    .maybeSingle();
  if (error) throw error;

  if (!updated) {
    // The page loaded this row successfully, so finding zero rows on UPDATE
    // means either (a) the row was marked attended by another path between
    // load and click (the common case), or (b) the row was deleted (rare).
    // Distinguish via a second lookup so the user gets honest feedback
    // instead of the conflated "already checked in or code not recognised."
    const { data: existing, error: lookupErr } = await admin
      .from('registrations')
      .select('id, status')
      .eq('registration_code', code)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!existing) return { error: 'This registration is no longer valid.' };
    return { error: "You're already checked in." };
  }

  revalidatePath('/checkin/confirm');
  return { ok: true, eventId: updated.event_id };
}
