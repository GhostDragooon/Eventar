'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

// Organiser-facing CPD accreditation config. This is the surface that makes
// the shipped CPD backend reachable: before it, nothing in the app read or
// wrote events.accrediting_body_id / events.cpd_hours, so no event could be
// made CPD-accredited through the product at all.
//
// The write goes through set_event_cpd_config() — an audited SECURITY DEFINER
// function — NOT a direct .update(). Those two columns have their table UPDATE
// grant deliberately revoked from `authenticated` (2026-07-25 HIGH-1b: an
// organiser could otherwise bind any body with any hours straight through
// PostgREST and mint credits the body never authorised). The definer function
// re-opens the capability behind a role gate, an ownership check, an active-body
// check, the <= 24h ceiling and an audit event.
//
// Uses the REQUEST-SCOPED client (supabaseServer), not the service-role admin
// client: the function derives the actor from the caller's session, so calling
// it as service_role would lose the identity the audit event records.

const ConfigSchema = z
  .object({
    eventId: z.string().uuid(),
    // '' means "clear" from a <select>/<input> that was emptied.
    bodyId: z.string().uuid().nullable(),
    cpdHours: z.number().positive().max(24).nullable(),
  })
  // Layer 2 of the three-layer validation mirroring the function's own 22023
  // guard: half-configured events silently skip issuance at check-in, which
  // looks to the organiser like accreditation that simply never pays out.
  .refine((v) => (v.bodyId === null) === (v.cpdHours === null), {
    message: 'Choose both an accrediting body and CPD hours, or clear both.',
  });

export type CpdConfigResult = { ok: true } | { error: string } | null;

// Signature is (prevState, formData) so the client can drive it with
// useActionState and pass it straight to <form action={...}>. That matters for
// more than ergonomics: with a plain onSubmit handler, a click landing BEFORE
// hydration falls back to a native GET submit, which silently does nothing and
// leaks every field into the URL as a query string. Wired as a form action, the
// submission is handled with or without client JS.
export async function setEventCpdConfig(
  _prevState: CpdConfigResult,
  formData: FormData,
): Promise<CpdConfigResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) return { error: 'Not authorised.' };
    throw e;
  }

  const rawBody = String(formData.get('bodyId') ?? '').trim();
  const rawHours = String(formData.get('cpdHours') ?? '').trim();

  const parsed = ConfigSchema.safeParse({
    eventId: String(formData.get('eventId') ?? ''),
    bodyId: rawBody === '' ? null : rawBody,
    cpdHours: rawHours === '' ? null : Number(rawHours),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the accreditation details.' };
  }

  const supabase = await supabaseServer();
  // p_actor_override: inert for a real session, makes this callable under
  // review mode too — see 20260814020000.
  const { error } = await supabase.rpc('set_event_cpd_config', {
    p_event_id: parsed.data.eventId,
    p_body_id: parsed.data.bodyId,
    p_cpd_hours: parsed.data.cpdHours,
    p_actor_override: staff.id,
  });

  if (error) {
    // Translate the function's own error codes into organiser language. The
    // raw messages name internal function and constraint identifiers, which
    // are exactly what should not reach a user.
    if (error.code === '22023') {
      // Two different 22023s reach here: the both-or-neither guard (already
      // caught by Zod above, so in practice this is the freeze trigger) and
      // freeze_cpd_config_if_credited on an event that has already issued.
      return {
        error:
          'Credits have already been issued for this event, so its accreditation can no longer be changed. Raise a correction instead.',
      };
    }
    if (error.code === '23514') return { error: 'CPD hours must be between 0 and 24.' };
    if (error.code === 'P0002') return { error: 'That accrediting body is not available.' };
    // Three causes raise 42501, and they need three different remedies.
    // Without the discriminator an organiser who IS the owner was told they
    // weren't, and went looking for a colleague instead of for the
    // accrediting body (or, since 20260821000000, instead of the wizard
    // below — a live-confirmed regression the first time this went out).
    // `detail` is set by set_event_cpd_config (20260804040000, extended
    // 20260821000000) and surfaced by PostgREST as `details`.
    if (error.code === '42501') {
      if (error.details === 'not_authorised_for_body') {
        return {
          error:
            'Your organisation isn’t authorised by that accrediting body, so its events can’t be marked as accredited by them. This is arranged with the body directly.',
        };
      }
      if (error.details === 'multi_body_configured') {
        return {
          error:
            'This event already has a multiple-body accreditation set up below — use that section to change accreditation, not this field.',
        };
      }
      return { error: 'Only the event owner can set its accreditation.' };
    }
    return { error: 'Could not save the accreditation. Try again.' };
  }

  // Both pages host this section (creating an event redirects to /edit), so
  // both must be revalidated — otherwise a save made on one leaves the other
  // showing stale accreditation until a hard reload.
  revalidatePath(`/events/${parsed.data.eventId}/details`);
  revalidatePath(`/events/${parsed.data.eventId}/edit`);
  return { ok: true };
}
