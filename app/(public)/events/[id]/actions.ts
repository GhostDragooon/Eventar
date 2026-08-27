'use server';

// Next 16: 'use server' files may export ONLY async functions. The Zod schema
// + types live in ./schema so this module stays compliant. (Earlier Next
// versions tolerated non-function exports; Next 16 rejects the module at load.)
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIp } from '@/lib/rateLimit';
import { registrationInputSchema, type RegisterResult, type EmailDelivery } from './schema';
import { generateRegistrationCode } from '@/lib/registrationCode';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
// TEMP: dual import while RESEND_API_KEY is being set up.
// REMOVE both lines + the env-switch below once the key is in .env.local.
// See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol".
import { sendEmail as sendEmailReal } from '@/lib/resend';
import { sendEmail as sendEmailStub } from '@/lib/devEmailStub';
import { renderConfirmationEmail } from '@/emails/confirmation';
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendarLinks';
import { getRequestOrigin } from '@/lib/origin';
import { formatInTz } from '@/lib/tz';
import { firstName } from '@/lib/name';

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
  const { data: event, error: eventErr } = await anon
    .from('events')
    .select('id, title, status, max_attendees, start_time, end_time, timezone, venue_name, venue_address, registration_close_at, registration_open_at, deleted_at')
    .eq('id', event_id)
    .maybeSingle();
  // A discarded error fell through to "Registrations are not open" — a
  // confident policy claim about an event whose row we never actually read,
  // told to someone who could in fact have registered (rule 12).
  if (eventErr) return { error: 'Could not load this event. Please try again.' };
  // deleted_at gate: softDeleteEvents only sets deleted_at, leaving
  // status='published', so a soft-deleted event stayed registrable via its
  // direct URL while /events, the cron dispatcher and self_check_in all filter
  // it. Anon RLS still returns the row (published), so this is the layer that
  // must exclude it. Security review 2026-08-06.
  if (!event || event.status !== 'published' || event.deleted_at != null) {
    return { error: 'Registrations are not open for this event.' };
  }

  // Step 2a — explicit open date (editor v4). A published event can sit as
  // Upcoming until registration_open_at arrives; reject early submits.
  if (event.registration_open_at != null && Date.now() < new Date(event.registration_open_at).getTime()) {
    return { error: 'Registration for this event has not opened yet.' };
  }

  // Step 2b — registration window gate. Registration closes at
  // registration_close_at if set, and unconditionally once the check-in
  // window opens (start − CHECKIN_OPEN_MINUTES, same boundary the
  // lifecycle's `live` state uses — G11). Ended events get a distinct
  // message. Display layers hide the form earlier; this is the
  // server-side layer of the three-layer validation rule. There is
  // deliberately no DB layer for this rule: a CHECK can't reference
  // now(), and this action is the only writer of registrations — same
  // single-writer rationale as updateRegistrationClose (vault,
  // Security + Robustness §1 per-mutation matrix).
  const nowMs = Date.now();
  if (nowMs > new Date(event.end_time).getTime()) {
    return { error: 'This event has already ended.' };
  }
  const checkinOpensMs =
    new Date(event.start_time).getTime() - CHECKIN_OPEN_MINUTES * 60_000;
  const closesMs =
    event.registration_close_at != null
      ? Math.min(new Date(event.registration_close_at).getTime(), checkinOpensMs)
      : checkinOpensMs;
  if (nowMs >= closesMs) {
    return { error: 'Registration for this event has closed.' };
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
  let reg: { id: string; registration_code: string } | null = null;
  let regErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRegistrationCode();
    const insertResult = await admin
      .from('registrations')
      .insert({ event_id, email, full_name, registration_code: candidate })
      .select('id, registration_code')
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

  // Step 6 — render template + dispatch via the facade.
  // TEMP: env switch picks devEmailStub when RESEND_API_KEY unset. See design doc.
  const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;

  const origin = await getRequestOrigin();
  const eventVenue = event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name;
  const eventUrl = `${origin}/events/${event.id}`;

  // Per design doc: props pre-formatted at call site; template stays pure
  // presentation. Email #1 carries NO code/QR (locked — the pass is Email #2);
  // it carries the add-to-calendar links instead.
  const calInput = {
    title: event.title,
    startIso: event.start_time,
    endIso: event.end_time,
    venue: eventVenue,
    detailsUrl: eventUrl,
    uid: event.id,
  };
  const html = await renderConfirmationEmail({
    firstName: firstName(full_name),
    eventTitle: event.title,
    eventStart: formatInTz(event.start_time, event.timezone),
    eventVenue,
    eventUrl,
    googleCalUrl: googleCalendarUrl(calInput),
    outlookCalUrl: outlookCalendarUrl(calInput),
    icsUrl: `${eventUrl}/calendar.ics`,
  });

  const sendResult = await sendEmail({
    to: email,
    subject: `You're registered: ${event.title}`,
    html,
  });

  // Step 7 — close the ledger per outcome; registration_id always set.
  // emailDelivery is what the client renders in the success block: `sent`,
  // `queued_dev`, or `failed`. Registration itself is authoritative and
  // returns ok:true regardless — the courtesy email never gates the seat.
  const logUpdate: Record<string, unknown> = { registration_id: reg.id };
  let emailDelivery: EmailDelivery;
  if ('ok' in sendResult) {
    logUpdate.status = 'sent';
    logUpdate.sent_at = new Date().toISOString();
    emailDelivery = 'sent';
  } else if ('skipped' in sendResult) {
    // TEMP: this branch goes away when the stub is removed.
    // email_log.status stays 'queued' (set at step 4); no Phase 9 sweep planned.
    console.log(
      `[email queued] confirmation for event ${event.id} registration ${reg.id} — RESEND_API_KEY unset`,
    );
    emailDelivery = 'queued_dev';
  } else {
    logUpdate.status = 'failed';
    logUpdate.error = `${sendResult.error.code}: ${sendResult.error.message}`;
    emailDelivery = 'failed';
  }
  const { error: closeErr } = await admin.from('email_log').update(logUpdate).eq('id', log.id);
  if (closeErr) {
    console.error('[registerForEvent] failed to close email_log row', {
      id: log.id,
      error: closeErr.message,
    });
  }

  // Step 8 — the public page may show updated counts in future phases.
  revalidatePath(`/events/${event_id}`);

  return { ok: true, emailDelivery };
}
