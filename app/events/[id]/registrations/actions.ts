'use server';

// DB-05 (MVP plan, P6): the audited roster edit. A registrant's name or email is corrected through
// update_registration_contact (SECURITY DEFINER, audited), never by writing the registrations table: no signed-in
// role holds UPDATE on it any more. UX-04 builds the edit dialog on this action.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const idSchema = z.string().uuid();
const contactSchema = z.object({
  registrationId: idSchema,
  fullName: z.string().trim().min(1, 'A name is required.').max(200, 'A name is at most 200 characters.'),
  email: z.string().trim().toLowerCase().max(254, 'An email is at most 254 characters.').email('That is not an email address.'),
});

export type UpdateRegistrationContactResult = { ok: true } | { error: string };

export async function updateRegistrationContact(
  input: { registrationId: string; fullName: string; email: string },
): Promise<UpdateRegistrationContactResult> {
  const staff = await requireStaff();

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(' ') };

  const supabase = await supabaseServer();
  // p_actor_override: inert for a real session (only honoured when auth.role() = 'service_role'), so the same call
  // works under review mode; see publishEvent in ../edit/actions.ts.
  const { data: eventId, error } = await supabase.rpc('update_registration_contact', {
    p_registration_id: parsed.data.registrationId,
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_actor_override: staff.id,
  });
  if (error) {
    if (error.message.startsWith('linked_registration:')) {
      return { error: 'This registration belongs to an Eventar account, so its email cannot be changed here. The name can.' };
    }
    if (error.message.startsWith('already_registered:')) {
      return { error: 'Another registration for this event already uses that email.' };
    }
    if (error.code === 'P0002') return { error: 'Registration not found.' };
    if (error.code === '42501') return { error: 'You do not have access to this registration.' };
    // UUID and code only: a Postgres DETAIL can carry a key value, which is PII.
    console.error('[roster] contact update failed', { registrationId: parsed.data.registrationId, code: error.code });
    return { error: 'Could not save the change. Please try again.' };
  }

  // The RPC returns the registration's own event, so the pages that go stale are always the right ones.
  revalidatePath(`/events/${eventId}/checkin`);
  revalidatePath(`/events/${eventId}/details`);
  revalidatePath(`/events/${eventId}/registrations`);
  return { ok: true };
}
