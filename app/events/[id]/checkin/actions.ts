'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * Mark a registrant as attended by their registration_code.
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS-via-admin
 * (we use admin because the staff tablet doesn't carry event-id context
 * when scanning a code; the code itself routes us to the right row).
 *
 * The action does NOT enforce that the staff member owns the event the
 * code belongs to. A manager running check-in for multiple concurrent
 * events from one tablet is a real use case; cross-event scans are made
 * visible via the success toast showing the event title.
 *
 * Idempotent via WHERE status != 'attended': a second writer for the
 * same code returns { error: 'Already attended at ...' } rather than
 * silently re-stamping check_in_at (CLAUDE.md rule 12).
 */
export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<
  | { ok: true; registration: { id: string; full_name: string; event_id: string; event_title: string } }
  | { error: string }
> {
  await requireStaff();
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();

  const { data: updated, error: updateErr } = await admin
    .from('registrations')
    .update({
      status: 'attended',
      check_in_at: new Date().toISOString(),
      check_in_method: method,
    })
    .eq('registration_code', code)
    .neq('status', 'attended')
    .select('id, full_name, event_id')
    .maybeSingle();
  if (updateErr) throw updateErr;

  if (!updated) {
    // Distinguish "code doesn't exist" from "code exists but already attended"
    // so the staff toast can be specific. Admin SELECT so RLS doesn't hide
    // the row from a manager scanning another organiser's code.
    const { data: existing, error: lookupErr } = await admin
      .from('registrations')
      .select('id, full_name, event_id, check_in_at')
      .eq('registration_code', code)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!existing) return { error: 'Code not recognised.' };
    return { error: `Already attended at ${existing.check_in_at}.` };
  }

  const { data: event, error: evtErr } = await admin
    .from('events')
    .select('title')
    .eq('id', updated.event_id)
    .maybeSingle();
  if (evtErr) throw evtErr;

  revalidatePath(`/events/${updated.event_id}/checkin`);
  return {
    ok: true,
    registration: {
      id: updated.id,
      full_name: updated.full_name,
      event_id: updated.event_id,
      event_title: event?.title ?? '',
    },
  };
}
