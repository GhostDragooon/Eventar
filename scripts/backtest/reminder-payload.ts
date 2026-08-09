/**
 * Backtest the deterministic-payload fix against the REAL email template.
 *
 * The unit test in emailActions.test.ts mocks `renderReminderEmail`, so it can
 * only prove the PROPS are stable — never that the rendered HTML is. That gap
 * matters: Resend rejects a reused idempotency key whose payload differs (409),
 * so any clock dependency inside the template itself would break every
 * scheduler retry while the unit test stayed green.
 *
 *   pnpm exec tsx scripts/backtest/reminder-payload.ts
 */
import { createHash } from 'node:crypto';
import { renderReminderEmail } from '../../emails/reminder';
import { renderSurveyInviteEmail } from '../../emails/surveyInvite';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
let bad = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

// Exactly what the scheduler path supplies: SCHEDULED_COUNTDOWN_LABEL, not a
// derived countdown. Every other field is a pure function of (event, recipient).
const reminderProps = {
  firstName: 'Karen',
  eventTitle: 'Clinical Update Seminar 2026',
  eventStart: '06 Aug 2026, 11:20 HKT',
  eventVenue: 'HKCEC — Room 2, 1 Expo Drive, Wan Chai',
  venueMapUrl: 'https://www.google.com/maps/search/?api=1&query=HKCEC',
  checkinCode: 'WK-YWERVP',
  qrCid: 'checkin-reg-1',
  countdownLabel: 'Starts within the hour',
};

async function main() {
  console.log('\nBacktest — real template determinism across a wall-clock gap\n');

  const first = await renderReminderEmail(reminderProps);
  const firstSurvey = await renderSurveyInviteEmail({
    firstName: 'Karen',
    eventTitle: reminderProps.eventTitle,
    eventStart: reminderProps.eventStart,
    eventVenue: reminderProps.eventVenue,
    surveyUrl: 'http://localhost:3100/survey?code=WK-YWERVP',
  });

  // A real gap, crossing a second boundary — enough for any Date-derived value
  // inside the template to change.
  await new Promise((r) => setTimeout(r, 2200));

  const second = await renderReminderEmail(reminderProps);
  const secondSurvey = await renderSurveyInviteEmail({
    firstName: 'Karen',
    eventTitle: reminderProps.eventTitle,
    eventStart: reminderProps.eventStart,
    eventVenue: reminderProps.eventVenue,
    surveyUrl: 'http://localhost:3100/survey?code=WK-YWERVP',
  });

  check('reminder HTML is byte-identical across the gap', first === second, `${sha(first)} vs ${sha(second)} (${first.length} bytes)`);
  check('survey HTML is byte-identical across the gap', firstSurvey === secondSurvey, `${sha(firstSurvey)} vs ${sha(secondSurvey)}`);

  // The scheduler's label must actually reach the output — if the template
  // dropped it, the stability above would be meaningless.
  check('the scheduler countdown label reaches the rendered output', first.includes('Starts within the hour'));

  // And a derived countdown must genuinely change the bytes, or the whole
  // 409 risk this fix addresses would not have been real.
  const derived = await renderReminderEmail({ ...reminderProps, countdownLabel: 'Starts in 55 minutes' });
  check('a wall-clock countdown DOES change the payload (the risk was real)', derived !== first, `${sha(derived)} vs ${sha(first)}`);

  console.log(`\n${bad === 0 ? 'BACKTEST PASS' : `BACKTEST FAIL (${bad})`}\n`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
