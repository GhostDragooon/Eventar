import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';

// The two time-dependent lines of the publish confirm ("what starts"). Clock times are in the EVENT's
// timezone, passed explicitly, never the server's or a hard-coded zone (eventar-timezone-correctness).
export type PublishFacts = { registrationOpens: string; checkinOpens: string };

export function publishFacts(input: {
  startIso: string;
  /** null when the zone is not known yet (create form before a venue is picked): say it without a clock time. */
  timezone: string | null;
  registrationOpenIso: string | null;
  nowMs: number;
}): PublishFacts {
  const { startIso, timezone, registrationOpenIso, nowMs } = input;
  const scheduled = registrationOpenIso != null && Date.parse(registrationOpenIso) > nowMs;
  const registrationOpens = !scheduled
    ? 'Registration opens now.'
    : timezone
      ? `Registration opens on ${formatInTz(registrationOpenIso, timezone)} (${timezone}).`
      : 'Registration opens on the date you set.';
  const checkinMs = Date.parse(startIso) - CHECKIN_OPEN_MINUTES * 60_000;
  // Publishing inside the last hour (or a past-dated draft): the door is already open, not "opens at" a past time.
  const checkinOpens =
    checkinMs <= nowMs
      ? 'Check-in is open now.'
      : timezone
        ? `Check-in opens at ${formatInTz(new Date(checkinMs).toISOString(), timezone)} (${timezone}), ${CHECKIN_OPEN_MINUTES} minutes before the start.`
        : `Check-in opens ${CHECKIN_OPEN_MINUTES} minutes before the start.`;
  return { registrationOpens, checkinOpens };
}
