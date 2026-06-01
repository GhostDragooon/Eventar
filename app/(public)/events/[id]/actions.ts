'use server';

// Next 16: 'use server' files may export ONLY async functions. The Zod schema
// + types live in ./schema so this module stays compliant. (Earlier Next
// versions tolerated non-function exports; Next 16 rejects the module at load.)
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIp } from '@/lib/rateLimit';
import { registrationInputSchema, type RegisterResult } from './schema';
import { generateRegistrationCode } from '@/lib/registrationCode';

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

  // Spam-registration defense: 30/min/IP. Generous for shared-WiFi bursts
  // (a workshop's worth of people registering from one office is 1-2 per
  // minute, well under the cap), restrictive against scripted spam.
  const limit = await rateLimitByIp('registerForEvent', { windowMs: 60_000, max: 30 });
  if (!limit.allowed) return { error: 'Too many attempts. Please try again in a moment.' };

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
  //
  // Generate a registration_code inline and retry on 23505 from the
  // registrations_code_unique constraint specifically (NOT from the
  // event_id+email constraint — that's the duplicate-registration error
  // and it has its own handling below). Up to 5 attempts; 31^4 namespace
  // (see lib/registrationCode.ts) makes 5 collisions in a row astronomically
  // rare. The unique constraint in the DB is the source of truth.
  let reg: { id: string } | null = null;
  let regErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRegistrationCode();
    const insertResult = await admin
      .from('registrations')
      .insert({ event_id, email, full_name, registration_code: candidate })
      .select('id')
      .single();
    if (insertResult.error) {
      const isCodeCollision =
        insertResult.error.code === '23505' &&
        insertResult.error.message.includes('registrations_code_unique');
      if (isCodeCollision) continue; // retry with a new candidate
      regErr = insertResult.error;
      break;
    }
    reg = insertResult.data;
    break;
  }

  if (!reg) {
    // Either all 5 collision retries exhausted (astronomically unlikely) or
    // a non-collision error fell through.
    // Mark the email_log row failed so the ledger doesn't keep a stale entry.
    await admin
      .from('email_log')
      .update({
        status: 'failed',
        error: regErr?.message ?? 'registration insert failed after 5 code-collision retries',
      })
      .eq('id', log.id);

    // Duplicate email -> friendly message; everything else -> generic.
    // The 23505 detection here matches on the event_id+email constraint name
    // (registrations_event_id_email_key is the conventional name PG generates
    // for `unique (event_id, email)`); the code-collision branch above
    // already retried + bailed on registrations_code_unique.
    if (regErr?.code === '23505' && regErr.message.includes('registrations_event_id_email_key')) {
      return { error: "You're already registered for this event." };
    }
    return { error: 'Registration failed. Please try again.' };
  }

  // Step 6 — Phase 7 replaces this with a real Resend call.
  // Logs UUIDs only per CLAUDE.md rule 10 (no PII in logs). To resolve back
  // to recipient + event title, SELECT the rows by id.
  console.log(
    `[email stub] would send confirmation for event ${event.id} (registration ${reg.id})`,
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
