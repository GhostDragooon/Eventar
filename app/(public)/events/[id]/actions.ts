'use server';

// Next 16: 'use server' files may export ONLY async functions. The Zod schema
// + types live in ./schema so this module stays compliant. (Earlier Next
// versions tolerated non-function exports; Next 16 rejects the module at load.)
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { registrationInputSchema, type RegisterResult } from './schema';

/**
 * Register an anonymous visitor for a published event.
 *
 * Order of operations matters: per CLAUDE.md rule 5, the email_log row is
 * inserted BEFORE any "send" attempt. For Phase 2 the "send" is a console
 * stub; the ordering still applies so the upgrade path to Resend in Phase 7
 * is a one-line swap.
 *
 * Flow:
 *   1. Zod-validate the input
 *   2. Read the event (anon RLS — fails if event isn't published)
 *   3. Capacity check (count vs max_attendees)
 *   4. INSERT email_log (status='queued')           — service-role
 *   5. INSERT registrations                          — anon under RLS
 *       - duplicate unique-violation -> mark email_log failed, return error
 *   6. console.log the would-be send                 — Phase 7 replaces this
 *   7. UPDATE email_log (status='sent', sent_at=now())
 *   8. revalidatePath the public event page
 */
export async function registerForEvent(input: unknown): Promise<RegisterResult> {
  const parse = registrationInputSchema.safeParse(input);
  if (!parse.success) {
    return { error: parse.error.issues.map(i => i.message).join('; ') };
  }
  const { event_id, full_name, email } = parse.data;

  const anon  = await supabaseServer();
  const admin = supabaseAdmin();

  // Step 2 — event must exist and be published. Anon RLS already filters
  // non-published events, but selecting explicit columns lets us read
  // max_attendees + title for the capacity check + stub message.
  const { data: event } = await anon
    .from('events')
    .select('id, title, status, max_attendees')
    .eq('id', event_id)
    .maybeSingle();
  if (!event || event.status !== 'published') {
    return { error: 'Registrations are not open for this event.' };
  }

  // Step 3 — capacity check. MUST use admin because anon has no SELECT
  // policy on registrations (PII). With anon, count would always be 0 and
  // the capacity gate would never fire. Caught by live-DB backtest after
  // Phase 2 first-pass. (Same fix as the page.tsx count query.)
  // NB: still best-effort under concurrent submissions; see notes T1.
  if (event.max_attendees != null) {
    const { count } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id);
    if ((count ?? 0) >= event.max_attendees) {
      return { error: 'This event is at capacity.' };
    }
  }

  // Step 4 — email_log FIRST. Even if the next step fails, the ledger row
  // exists and Phase 9's cron can reconcile.
  const { data: log, error: logErr } = await admin
    .from('email_log')
    .insert({
      purpose: 'confirmation',
      event_id,
      recipient_email: email,
      status: 'queued',
    })
    .select('id')
    .single();
  if (logErr || !log) {
    return { error: 'Could not record registration. Please try again.' };
  }

  // Step 5 — the actual registration row. MUST use admin: the anon RLS
  // policy grants INSERT but not SELECT, and Postgres's RETURNING (which
  // .select() triggers) requires SELECT on the underlying row. Trying this
  // as anon fails with the misleading "new row violates row-level security
  // policy" error. The defense-in-depth that anon's RLS provides is still
  // in place for any direct REST API hits at /rest/v1/registrations — the
  // policy gates non-published events there. For the Server Action's own
  // flow, step 2 above already verified event.status='published', so
  // bypassing RLS via admin here is safe.
  // Unique(event_id, email) still fires under admin -> 23505.
  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .insert({ event_id, email, full_name })
    .select('id')
    .single();

  if (regErr || !reg) {
    // Mark the email_log row failed so the ledger doesn't keep a stale queue entry.
    await admin
      .from('email_log')
      .update({ status: 'failed', error: regErr?.message ?? 'no-row' })
      .eq('id', log.id);

    // Duplicate email -> friendly message; everything else -> generic.
    if (regErr?.code === '23505') {
      return { error: "You're already registered for this event." };
    }
    return { error: 'Registration failed. Please try again.' };
  }

  // Step 6 — Phase 7 replaces this with a real Resend call.
  console.log(
    `[email stub] would send confirmation to ${email} for event "${event.title}" (registration ${reg.id})`,
  );

  // Step 7 — close the ledger entry. Failure here is logged but doesn't
  // fail the registration (the row exists; we'll reconcile later).
  const { error: closeErr } = await admin
    .from('email_log')
    .update({ status: 'sent', sent_at: new Date().toISOString(), registration_id: reg.id })
    .eq('id', log.id);
  if (closeErr) {
    console.error('[registerForEvent] failed to close email_log row', { id: log.id, error: closeErr.message });
  }

  // Step 8 — the public page may show updated counts in future phases.
  revalidatePath(`/events/${event_id}`);

  return { ok: true };
}
