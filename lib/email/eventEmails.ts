import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRequestOrigin } from '@/lib/origin';
import { formatInTz } from '@/lib/tz';
import { firstName } from '@/lib/name';
import { buildCheckinQrPng } from '@/lib/checkinQr';
import { renderReminderEmail } from '@/emails/reminder';
import { renderSurveyInviteEmail } from '@/emails/surveyInvite';
// TEMP: dual import while RESEND_API_KEY is being set up. Removed alongside the
// other stub call sites once the key lands — see the Phase 7 removal protocol.
import { sendEmail as sendEmailReal } from '@/lib/resend';
import { sendEmail as sendEmailStub } from '@/lib/devEmailStub';
import type { EmailAttachment } from '@/lib/resend';
import { MAX_SEND_ATTEMPTS } from '@/lib/email/sendPolicy';

/**
 * The session-less core of the reminder + survey sends.
 *
 * Split out of `app/events/[id]/details/emailActions.ts` so the scheduler can
 * reuse it: those Server Actions start with `requireStaff()`, which THROWS when
 * there is no session, and `/api/cron/dispatch` has none. Authorization is the
 * caller's job — the Server Actions gate on requireStaff + an owner/manager
 * check, the cron route gates on a shared secret. Nothing here re-checks it, so
 * do not call these from anywhere that has not already authorized.
 */

export type SendResult = {
  sent: number; // real send returned ok
  queued: number; // dev-stub path (RESEND_API_KEY unset) — logged, not sent
  skipped: number; // idempotent skip — already delivered
  stalled: number; // a prior row was logged but never emailed, and never will be
  failed: number; // send returned an error — RETRIES on the next tick
  gaveUp: number; // retry budget exhausted — will NEVER be retried automatically
  error?: string; // whole-batch failure (auth / not-found); no per-recipient work done
};

/**
 * `manual: true` marks a send a human explicitly asked for (the Event Manager
 * buttons), as opposed to a scheduler tick. The only thing it changes is the
 * retry budget — see MAX_SEND_ATTEMPTS.
 */
export type SendOptions = { manual?: boolean };

export type EventRow = {
  id: string;
  title: string;
  status: string;
  start_time: string;
  end_time: string;
  timezone: string;
  venue_name: string;
  venue_address: string | null;
  created_by: string;
};

type Recipient = { id: string; email: string; full_name: string; registration_code: string };
type Envelope = { subject: string; html: string; attachments?: EmailAttachment[] };

export function zero(error?: string): SendResult {
  return { sent: 0, queued: 0, skipped: 0, stalled: 0, failed: 0, gaveUp: 0, ...(error ? { error } : {}) };
}

/**
 * Recipients for a send, read via admin (NOT the RLS-scoped supabaseServer).
 * The caller already enforced authorization; and registrations has no anon
 * SELECT policy, so an RLS read returns zero rows whenever there's no
 * interactive staff DB session — which is the case under review mode AND for
 * the session-less cron caller. Same admin-after-auth pattern as
 * registerForEvent's registrations access.
 */
async function readRecipients(
  eventId: string,
  status: 'registered' | 'attended',
): Promise<{ recipients: Recipient[] } | { error: string }> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('registrations')
    .select('id, email, full_name, registration_code, status')
    .eq('event_id', eventId)
    .eq('status', status);

  // A failed read must NOT collapse into an empty roster. It used to return
  // [], which every caller reads as "nobody to email" — so a transient DB
  // error mid-tick skipped an entire event's reminders and reported success
  // ("No registered attendees yet"). Rule 12: surface it.
  if (error) {
    console.error('[readRecipients] recipient query failed', {
      eventId,
      status,
      code: error.code ?? 'unknown',
    });
    return { error: 'Could not load the recipient list — nothing was sent. Try again.' };
  }

  return { recipients: (data ?? []) as Recipient[] };
}



/**
 * Explicit bound on the retry-budget read. PostgREST silently truncates at the
 * project's `db.max_rows`, so an unbounded read looks complete and is not.
 * Sized well above any realistic (event, purpose) failure count — reaching it
 * means something is badly wrong and is logged as such.
 */
const BUDGET_READ_LIMIT = 5000;

/**
 * Resend already holds this idempotency key, so an earlier request with it was
 * accepted — the mail is delivered or in flight. Not a failure, and above all
 * NOT retryable: retrying burns the whole budget on repeat 409s and ends in a
 * give-up for someone who actually received their email.
 *
 * Reached when the payload legitimately changed between attempts — chiefly a
 * staff edit to the event's title/venue/time between two ticks, which the
 * deterministic-payload fix cannot prevent.
 *
 * Keyed on the HTTP status first, since `lib/resend.ts` surfaces it directly;
 * the two name codes are the fallback. KNOWN GAP: if Resend returns a 409 whose
 * body is not valid JSON, the SDK collapses it to `application_error` with no
 * status, so neither check fires and it degrades to an ordinary failure —
 * bounded by MAX_SEND_ATTEMPTS, not silent.
 */
function isAlreadySubmitted(error: { code: string; statusCode?: number }): boolean {
  return (
    error.statusCode === 409 ||
    error.code === 'invalid_idempotent_request' ||
    error.code === 'concurrent_idempotent_requests'
  );
}

/**
 * Idempotent bulk send. Per CLAUDE.md hard rule 2 the email_log row is inserted
 * FIRST; the partial unique index on (event_id, registration_id, purpose) makes
 * a re-run — a double-clicked button, a concurrent worker, or the cron
 * dispatcher — collide with 23505 and skip rather than double-send. Email
 * failures update the ledger (rule 12) but never abort the batch.
 *
 * Since 20260805000000 the index excludes `failed` rows, so a transient provider
 * error is retried on the next tick instead of being lost forever. `sent` and
 * `queued` both remain terminal — see that migration's header for why the two
 * statuses are treated differently.
 */
async function runBulkSend(
  eventId: string,
  purpose: 'reminder' | 'survey',
  recipients: Recipient[],
  build: (reg: Recipient) => Promise<Envelope>,
  { manual = false }: SendOptions = {},
): Promise<SendResult> {
  const admin = supabaseAdmin();
  // TEMP: env switch picks devEmailStub when RESEND_API_KEY unset (Phase 7).
  const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;

  // One read serving two purposes: the scheduler's retry budget, and knowing
  // WHAT a later 23505 collided with. It runs on the manual path too — not for
  // the budget (manual is exempt) but because "already sent" and "logged but
  // never emailed" are opposite messages and only the row's status tells them
  // apart.
  const { data: priorRows, error: priorErr } = await admin
    .from('email_log')
    .select('registration_id, status, origin')
    .eq('event_id', eventId)
    .eq('purpose', purpose)
    // PostgREST caps rows at the project's `db.max_rows` (1000 locally).
    // Without an explicit bound an over-cap read silently returns a truncated,
    // unordered slice, so recipients past the boundary get their budget reset
    // to zero and the retry storm the cap exists to prevent resumes (I-6).
    .limit(BUDGET_READ_LIMIT);

  // A failed read must not silently become "nobody has failed yet", which would
  // drop the cap for every recipient — the exact retry storm it exists to
  // prevent, invisible (rule 12). Deliberately NOT fatal: refusing to send over
  // a bookkeeping read would cause the mail loss this whole change is meant to
  // stop. Proceed uncapped, but say so loudly.
  if (priorErr) {
    console.error('[runBulkSend] prior-send read failed — proceeding UNCAPPED', {
      purpose,
      eventId,
      code: priorErr.code ?? 'unknown',
    });
  }

  // Hitting the limit means the read was truncated, so the counts are an
  // undercount and some recipients look fresher than they are. Not fatal — an
  // undercount means extra retries, never a double-send — but never silent.
  if ((priorRows?.length ?? 0) >= BUDGET_READ_LIMIT) {
    console.error('[runBulkSend] prior-send read hit its row limit — budget is an UNDERCOUNT', {
      purpose,
      eventId,
      limit: BUDGET_READ_LIMIT,
    });
  }

  const attempts = new Map<string, number>();
  /** Terminal status already on record per recipient — what a 23505 will hit. */
  const settledStatus = new Map<string, 'sent' | 'queued'>();

  for (const row of (priorRows ?? []) as Array<{
    registration_id: string | null;
    status: 'queued' | 'sent' | 'failed';
    origin: string | null;
  }>) {
    if (!row.registration_id) continue;
    // Only the SCHEDULER's own failures count toward the budget. A human
    // clicking the rescue button during a provider outage would otherwise
    // exhaust it for the whole roster, and the scheduler would give up on
    // everyone the moment the provider recovered (dev-lens I-3).
    if (row.status === 'failed') {
      if (!manual && row.origin !== 'manual') {
        attempts.set(row.registration_id, (attempts.get(row.registration_id) ?? 0) + 1);
      }
      continue;
    }
    // 'sent' outranks 'queued': a delivered row is the honest answer even if a
    // stale queued row also exists.
    if (row.status === 'sent') settledStatus.set(row.registration_id, 'sent');
    else if (!settledStatus.has(row.registration_id)) settledStatus.set(row.registration_id, 'queued');
  }

  let sent = 0;
  let queued = 0;
  let skipped = 0;
  let stalled = 0;
  let failed = 0;
  let gaveUp = 0;

  for (const reg of recipients) {
    if ((attempts.get(reg.id) ?? 0) >= MAX_SEND_ATTEMPTS) {
      // Its OWN outcome, deliberately neither `skipped` nor `failed`.
      // `skipped` renders as "already sent" — rule 12 forbids a loss reading
      // as a success. `failed` would be honest but not actionable: a failure
      // retries on the next tick, a give-up never will, and the operator's
      // response to each is opposite. The prior failed rows are the ledger
      // evidence; no new row is written for a giving-up decision.
      gaveUp += 1;
      console.error('[runBulkSend] retry budget exhausted, giving up on recipient', {
        purpose,
        eventId,
        registrationId: reg.id,
        attempts: attempts.get(reg.id),
      });
      continue;
    }

    const { data: log, error: logErr } = await admin
      .from('email_log')
      .insert({
        purpose,
        event_id: eventId,
        registration_id: reg.id,
        recipient_email: reg.email,
        status: 'queued',
        // Only scheduler rows count toward the retry budget — see the read above.
        origin: manual ? 'manual' : 'scheduler',
      })
      .select('id')
      .single();
    if (logErr || !log) {
      if (logErr?.code === '23505') {
        // WHAT it collided with decides what the operator is told. A 'sent' row
        // means genuinely already delivered. A 'queued' row means the ledger
        // was written and the send never happened — terminal under the dedup
        // index, so it will NEVER be delivered — and reporting that as
        // "already sent" is rule 12 inverted, the same inversion the failed-row
        // fix was written to kill (user-lens CRITICAL-3).
        if (settledStatus.get(reg.id) === 'queued') {
          stalled += 1;
          console.error('[runBulkSend] collided with a stale queued row — never emailed, never will be', {
            purpose,
            eventId,
            registrationId: reg.id,
          });
        } else {
          skipped += 1; // already delivered for this (event, registration, purpose)
        }
        continue;
      }
      // Genuine ledger-insert failure: no email_log row to inspect afterwards,
      // so leave a diagnosable trace (rule 12). UUIDs + error code only — never
      // the recipient's email or name (rule 10).
      failed += 1;
      console.error('[runBulkSend] email_log insert failed', {
        purpose,
        eventId,
        registrationId: reg.id,
        code: logErr?.code ?? 'unknown',
      });
      continue;
    }

    const envelope = await build(reg);
    const result = await sendEmail({
      to: reg.email,
      subject: envelope.subject,
      html: envelope.html,
      attachments: envelope.attachments,
      // Stable across every retry of this exact (event, purpose, recipient),
      // which is the same triple the dedup index keys on. A network error is
      // returned as `{ error }` indistinguishably from a rejection, so a send
      // Resend accepted can be recorded `failed` and retried next tick — this
      // key is what stops that retry becoming a second QR pass.
      idempotencyKey: `${eventId}:${purpose}:${reg.id}`,
    });

    if ('ok' in result) {
      sent += 1;
      await admin.from('email_log').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id);
    } else if ('error' in result && isAlreadySubmitted(result.error)) {
      // Counts as `skipped`, which renders "already sent" — accurate here, and
      // the row is marked terminal so no later tick retries it.
      skipped += 1;
      await admin
        .from('email_log')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', log.id);
    } else if ('skipped' in result) {
      // TEMP: stub path — row stays 'queued'. A queued row is TERMINAL under
      // email_log_dedup_idx; the dispatcher must never treat it as "needs
      // sending" (see lib/cron/dispatchDue.ts and docs/plans/PROJECT_STATE.md).
      queued += 1;
    } else {
      failed += 1;
      const { error: markErr } = await admin
        .from('email_log')
        .update({ status: 'failed', error: `${result.error.code}: ${result.error.message}` })
        .eq('id', log.id);
      // This update IS the retry ticket now: only a 'failed' row escapes
      // email_log_dedup_idx. If it doesn't land, the row stays 'queued' —
      // terminal — so the recipient is never retried, while the operator is
      // told "retrying automatically". Harmless before failed rows became
      // retryable; load-bearing since. Surface it (rule 12).
      if (markErr) {
        console.error('[runBulkSend] could not mark row failed — recipient will NOT be retried', {
          purpose,
          eventId,
          registrationId: reg.id,
          code: markErr.code ?? 'unknown',
        });
      }
    }
  }

  return { sent, queued, skipped, stalled, failed, gaveUp };
}

function assembleVenue(event: EventRow): string {
  return event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name;
}

// Google Maps search deep-link — the venue text itself is the map link in the
// reminder (Email #2 v6: "the map link should be embedded in the location").
function buildMapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

// Human countdown for the reminder pill. The cron dispatcher fires ~60 min
// before start; a manually-clicked send may be any distance out, so derive it.
/**
 * The scheduler's reminder must render IDENTICALLY on every retry. Resend
 * rejects a reused idempotency key whose payload differs (409), so a live
 * countdown — which changes every minute — would make each retry fail, on the
 * exact path retries exist for. `selectDue` only dispatches a reminder inside
 * the 60-minute pre-start window, so this phrasing is always accurate there.
 *
 * The manual send keeps the derived countdown below: it is never retried, and
 * an operator may fire it any distance from start.
 */
const SCHEDULED_COUNTDOWN_LABEL = 'Starts within the hour';

function formatCountdown(startIso: string): string {
  const minutes = Math.round((new Date(startIso).getTime() - Date.now()) / 60_000);
  if (minutes <= 1) return 'Starting now';
  if (minutes < 90) return `Starts in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} hours`;
}

/**
 * Email #2 — the 60-min reminder + personal check-in pass to every registered
 * attendee. Idempotent per recipient. Caller MUST have authorized already.
 */
export async function sendReminderToRegistrants(
  event: EventRow,
  opts: SendOptions = {},
): Promise<SendResult> {
  const read = await readRecipients(event.id, 'registered');
  if ('error' in read) return zero(read.error);
  const recipients = read.recipients;
  if (recipients.length === 0) return zero();

  const origin = await getRequestOrigin();
  const eventStart = formatInTz(event.start_time, event.timezone);
  const eventVenue = assembleVenue(event);
  const venueMapUrl = buildMapsUrl(eventVenue);
  const countdownLabel = opts.manual ? formatCountdown(event.start_time) : SCHEDULED_COUNTDOWN_LABEL;

  return runBulkSend(event.id, 'reminder', recipients, async (reg) => {
    const qr = await buildCheckinQrPng(reg.registration_code, origin);
    const qrCid = `checkin-${reg.id}`;
    const html = await renderReminderEmail({
      firstName: firstName(reg.full_name),
      eventTitle: event.title,
      eventStart,
      eventVenue,
      venueMapUrl,
      checkinCode: reg.registration_code,
      qrCid,
      countdownLabel,
    });
    return {
      subject: `Reminder: ${event.title} starts soon`,
      html,
      attachments: [{ filename: qr.filename, content: qr.pngBase64, contentId: qrCid }],
    };
  }, opts);
}

/**
 * Email #3 — the post-event survey invite to every attended registrant.
 * Idempotent per recipient. Caller MUST have authorized already.
 */
export async function sendSurveyInviteToAttendees(
  event: EventRow,
  opts: SendOptions = {},
): Promise<SendResult> {
  const read = await readRecipients(event.id, 'attended');
  if ('error' in read) return zero(read.error);
  const recipients = read.recipients;
  if (recipients.length === 0) return zero();

  const origin = await getRequestOrigin();
  const eventStart = formatInTz(event.start_time, event.timezone);
  const eventVenue = assembleVenue(event);

  return runBulkSend(event.id, 'survey', recipients, async (reg) => {
    const html = await renderSurveyInviteEmail({
      firstName: firstName(reg.full_name),
      eventTitle: event.title,
      eventStart,
      eventVenue,
      surveyUrl: `${origin}/survey?code=${encodeURIComponent(reg.registration_code)}`,
    });
    return { subject: `How was ${event.title}?`, html };
  }, opts);
}
