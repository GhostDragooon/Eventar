// scripts/demo/render-emails.ts — LOCAL-STACK-ONLY email preview renderer.
//
// The run sheet's prep step wants to eyeball the two attendee-facing emails
// (confirmation + reminder/pass) as they'll actually look, without wiring up a
// real send. This renders both templates for the demo's pre-registered
// attendee — pulling the LIVE registration_code from the seeded fixture so the
// manual code and QR match what the app would send — and writes standalone
// HTML files you can open in a browser.
//
// The reminder template references its QR as `<img src="cid:…">` (an email
// attachment content-id); browsers can't resolve cid:, so here the cid src is
// swapped for a self-contained data: URI generated from the SAME
// buildCheckinQrPng() the real sender uses. Prop assembly mirrors the two real
// senders exactly:
//   - confirmation: app/(public)/events/[id]/actions.ts
//   - reminder:     app/events/[id]/details/emailActions.ts
// (assembleVenue / buildMapsUrl / formatCountdown are non-exported helpers in
// that 'use server' module, so the small formatting is replicated below.)
//
// Output: scratch-demo/confirmation.html + scratch-demo/pass-reminder.html
// (scratch-demo/ is git-ignored). Links use DEMO_SITE_URL or http://localhost:3100.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { admin } from './lib';
import { renderConfirmationEmail } from '../../emails/confirmation';
import { renderReminderEmail } from '../../emails/reminder';
import { buildCheckinQrPng } from '../../lib/checkinQr';
import { googleCalendarUrl, outlookCalendarUrl } from '../../lib/calendarLinks';
import { formatInTz } from '../../lib/tz';
import { firstName } from '../../lib/name';

const EVENT_TITLE = 'Clinical Update Seminar 2026';
const DEMO_ATTENDEE_EMAIL = 'k.lau@demo.test';
const ORIGIN = process.env.DEMO_SITE_URL ?? 'http://localhost:3100';
const OUT_DIR = resolve(process.cwd(), 'scratch-demo');

// Mirror of emailActions.ts's non-exported helpers.
function assembleVenue(venueName: string, venueAddress: string | null): string {
  return venueAddress ? `${venueName}, ${venueAddress}` : venueName;
}
function buildMapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}
function formatCountdown(startIso: string): string {
  const minutes = Math.round((new Date(startIso).getTime() - Date.now()) / 60_000);
  if (minutes <= 1) return 'Starting now';
  if (minutes < 90) return `Starts in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} hours`;
}

async function main() {
  const client = admin(); // asserts the local stack via localEnv()

  // Pull the seeded event + the pre-registered attendee's live code.
  const { data: event, error: evErr } = await client
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, venue_address')
    .eq('title', EVENT_TITLE)
    .maybeSingle();
  if (evErr) throw evErr;
  if (!event) throw new Error(`Demo event "${EVENT_TITLE}" not found — run seed-demo.ts first.`);

  const { data: reg, error: regErr } = await client
    .from('registrations')
    .select('id, full_name, registration_code')
    .eq('event_id', event.id)
    .eq('email', DEMO_ATTENDEE_EMAIL)
    .maybeSingle();
  if (regErr) throw regErr;
  if (!reg) throw new Error(`Demo attendee ${DEMO_ATTENDEE_EMAIL} not registered — run seed-demo.ts first.`);

  const eventUrl = new URL(`/events/${event.id}`, ORIGIN).toString();
  const eventStart = formatInTz(event.start_time, event.timezone);
  const eventVenue = assembleVenue(event.venue_name, event.venue_address);
  const name = firstName(reg.full_name);

  // ---- Email #1: confirmation (no code/QR — carries the calendar links) ----
  const calInput = {
    title: event.title,
    startIso: event.start_time,
    endIso: event.end_time,
    venue: eventVenue,
    detailsUrl: eventUrl,
    uid: event.id,
  };
  const confirmationHtml = await renderConfirmationEmail({
    firstName: name,
    eventTitle: event.title,
    eventStart,
    eventVenue,
    eventUrl,
    googleCalUrl: googleCalendarUrl(calInput),
    outlookCalUrl: outlookCalendarUrl(calInput),
    icsUrl: `${eventUrl}/calendar.ics`,
  });

  // ---- Email #2: reminder / pass — swap the cid: QR for a data: URI ----
  const qr = await buildCheckinQrPng(reg.registration_code, ORIGIN);
  const qrCid = `checkin-${reg.id}`;
  const reminderHtmlCid = await renderReminderEmail({
    firstName: name,
    eventTitle: event.title,
    eventStart,
    eventVenue,
    venueMapUrl: buildMapsUrl(eventVenue),
    checkinCode: reg.registration_code,
    qrCid,
    countdownLabel: formatCountdown(event.start_time),
  });
  const reminderHtml = reminderHtmlCid.replaceAll(
    `cid:${qrCid}`,
    `data:image/png;base64,${qr.pngBase64}`,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const confirmationPath = resolve(OUT_DIR, 'confirmation.html');
  const reminderPath = resolve(OUT_DIR, 'pass-reminder.html');
  writeFileSync(confirmationPath, confirmationHtml, 'utf8');
  writeFileSync(reminderPath, reminderHtml, 'utf8');

  console.log('');
  console.log('=== Demo emails rendered ===');
  console.log(`Attendee:     ${reg.full_name} <${DEMO_ATTENDEE_EMAIL}>`);
  console.log(`Manual code:  ${reg.registration_code}  (matches the reminder's QR + big code)`);
  console.log('');
  console.log('Open in a browser:');
  console.log(`  Confirmation:  ${confirmationPath}`);
  console.log(`  Reminder/pass: ${reminderPath}`);
  console.log('');
}

main().catch((err) => {
  console.error('[render-emails] failed:', err);
  process.exit(1);
});
