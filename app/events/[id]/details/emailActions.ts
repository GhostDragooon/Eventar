'use server';

// Next 16: 'use server' files may export ONLY async functions. Shared types +
// helpers below stay non-exported so this module stays compliant.
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
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

type SendResult = {
  sent: number; // real send returned ok
  queued: number; // dev-stub path (RESEND_API_KEY unset) — logged, not sent
  skipped: number; // idempotent skip — an email_log row already existed
  failed: number; // send returned an error
  error?: string; // whole-batch failure (auth / not-found); no per-recipient work done
};

type EventRow = {
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

function zero(error?: string): SendResult {
  return { sent: 0, queued: 0, skipped: 0, failed: 0, ...(error ? { error } : {}) };
}

/**
 * requireStaff + owner/manager gate for the event, reading it under RLS.
 * Owner-only-by-default (Q19); managers see all (Q16). Returns the event row
 * on success or a whole-batch error string.
 */
async function authorizeEvent(eventId: string): Promise<{ event: EventRow } | { error: string }> {
  const staff = await requireStaff();
  // Admin read (RLS-independent): surveys target *completed* events, which the
  // anon RLS session (review mode) and the future session-less pg_cron caller
  // cannot read via supabaseServer — the events anon policy exposes only
  // 'published'. Authorization is enforced in-code by the explicit
  // owner/manager gate below; requireStaff already established identity.
  const admin = supabaseAdmin();
  const { data: event } = await admin
    .from('events')
    .select('id, title, status, start_time, end_time, timezone, venue_name, venue_address, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { error: 'Event not found.' };
  const canManage = event.created_by === staff.id || staff.role === 'manager';
  if (!canManage) return { error: 'You are not authorized for this event.' };
  return { event: event as EventRow };
}

/**
 * Recipients for a send, read via admin (NOT the RLS-scoped supabaseServer).
 * authorizeEvent already enforced authorization (requireStaff + explicit
 * owner/manager gate); and registrations has no anon SELECT policy, so an
 * RLS read returns zero rows whenever there's no interactive staff DB session
 * — which is the case under review mode AND for the future session-less
 * pg_cron caller that is meant to reuse these actions. Same admin-after-auth
 * pattern as registerForEvent's registrations access.
 */
async function readRecipients(eventId: string, status: 'registered' | 'attended'): Promise<Recipient[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('registrations')
    .select('id, email, full_name, registration_code, status')
    .eq('event_id', eventId)
    .eq('status', status);
  return (data ?? []) as Recipient[];
}

/**
 * Idempotent bulk send. Per CLAUDE.md hard rule 2 the email_log row is inserted
 * FIRST; the partial unique index on (event_id, registration_id, purpose) makes
 * a re-run — a double-clicked button, a concurrent worker, or the future
 * pg_cron caller — collide with 23505 and skip rather than double-send. Email
 * failures update the ledger (rule 12) but never abort the batch.
 */
async function runBulkSend(
  eventId: string,
  purpose: 'reminder' | 'survey',
  recipients: Recipient[],
  build: (reg: Recipient) => Promise<Envelope>,
): Promise<SendResult> {
  const admin = supabaseAdmin();
  // TEMP: env switch picks devEmailStub when RESEND_API_KEY unset (Phase 7).
  const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;

  let sent = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const reg of recipients) {
    const { data: log, error: logErr } = await admin
      .from('email_log')
      .insert({ purpose, event_id: eventId, registration_id: reg.id, recipient_email: reg.email, status: 'queued' })
      .select('id')
      .single();
    if (logErr || !log) {
      if (logErr?.code === '23505') {
        skipped += 1; // already handled for this (event, registration, purpose)
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
    });

    if ('ok' in result) {
      sent += 1;
      await admin.from('email_log').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id);
    } else if ('skipped' in result) {
      // TEMP: stub path — row stays 'queued' (no Phase 9 sweep planned).
      queued += 1;
    } else {
      failed += 1;
      await admin
        .from('email_log')
        .update({ status: 'failed', error: `${result.error.code}: ${result.error.message}` })
        .eq('id', log.id);
    }
  }

  return { sent, queued, skipped, failed };
}

function assembleVenue(event: EventRow): string {
  return event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name;
}

// Google Maps search deep-link — the venue text itself is the map link in the
// reminder (Email #2 v6: "the map link should be embedded in the location").
function buildMapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

// Human countdown for the reminder pill. The pg_cron caller fires ~60 min
// before start; a manually-clicked send may be any distance out, so derive it.
function formatCountdown(startIso: string): string {
  const minutes = Math.round((new Date(startIso).getTime() - Date.now()) / 60_000);
  if (minutes <= 1) return 'Starting now';
  if (minutes < 90) return `Starts in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} hours`;
}

/**
 * Email #2 — send the 60-min reminder + personal check-in pass to every
 * registered attendee of the event. Staff-gated; idempotent per recipient.
 * The future pg_cron reminder job calls this same action on a schedule.
 */
export async function sendReminderForEvent(eventId: string): Promise<SendResult> {
  const gate = await authorizeEvent(eventId);
  if ('error' in gate) return zero(gate.error);
  const { event } = gate;

  const recipients = await readRecipients(eventId, 'registered');
  if (recipients.length === 0) return zero();

  const origin = await getRequestOrigin();
  const eventStart = formatInTz(event.start_time, event.timezone);
  const eventVenue = assembleVenue(event);
  const venueMapUrl = buildMapsUrl(eventVenue);
  const countdownLabel = formatCountdown(event.start_time);

  const result = await runBulkSend(eventId, 'reminder', recipients, async (reg) => {
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
  });

  revalidatePath(`/events/${eventId}/details`);
  return result;
}

/**
 * Email #3 — send the post-event survey invite to every attended registrant.
 * Staff-gated; idempotent per recipient. The future pg_cron survey job calls
 * this same action 10 minutes after the event ends.
 */
export async function sendSurveyInviteForEvent(eventId: string): Promise<SendResult> {
  const gate = await authorizeEvent(eventId);
  if ('error' in gate) return zero(gate.error);
  const { event } = gate;

  const recipients = await readRecipients(eventId, 'attended');
  if (recipients.length === 0) return zero();

  const origin = await getRequestOrigin();
  const eventStart = formatInTz(event.start_time, event.timezone);
  const eventVenue = assembleVenue(event);

  const result = await runBulkSend(eventId, 'survey', recipients, async (reg) => {
    const html = await renderSurveyInviteEmail({
      firstName: firstName(reg.full_name),
      eventTitle: event.title,
      eventStart,
      eventVenue,
      surveyUrl: `${origin}/survey?code=${encodeURIComponent(reg.registration_code)}`,
    });
    return { subject: `How was ${event.title}?`, html };
  });

  revalidatePath(`/events/${eventId}/details`);
  return result;
}
