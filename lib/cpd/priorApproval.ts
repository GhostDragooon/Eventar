/**
 * Prior-approval deadline advisory (Task 10.9/10.9 — "S3").
 *
 * HKCP requires local FCAA accreditation applications submitted at least
 * `lead_time_days` before the event, and does not accept late/retrospective
 * local applications (source: HKAM CME/CPD Guidelines, Cycle 2026-2028 — see
 * the `source` field on each body's `cycle_config.prior_approval`).
 *
 * Advisory only. Eventar cannot see an application filed out-of-band by
 * email, so `passed` never blocks a save — it only tells the organiser the
 * suggested deadline has gone by.
 *
 * Anchored to the accrediting body's own zone, never the event's timezone or
 * bare UTC: for a legal deadline the calendar day IS the point — an event
 * starting at 00:30 HKT is still the previous calendar day in UTC.
 */

export type PriorApproval = { deadline: Date; passed: boolean };

const DAY_MS = 86_400_000;

function calendarDateIn(iso: string, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(m.year), month: Number(m.month), day: Number(m.day) };
}

// Offset (ms east of UTC) the zone has at an instant.
function offsetMs(instant: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// The instant of 23:59:59.999 on a calendar day in `timeZone`; two passes settle a DST change that day.
function endOfLocalDay(year: number, month: number, day: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  let t = wall - offsetMs(wall, timeZone);
  t = wall - offsetMs(t, timeZone);
  return new Date(t);
}

/** `timeZone` is the accrediting body's own zone (lib/cpd/jurisdictionTz), not the event's. */
export function priorApprovalDeadline(start_time: string, cycle_config: unknown, timeZone: string): PriorApproval | null {
  const leadDays = (
    cycle_config as { prior_approval?: { lead_time_days?: unknown } } | null | undefined
  )?.prior_approval?.lead_time_days;
  if (typeof leadDays !== 'number' || !Number.isFinite(leadDays)) return null;

  const { year, month, day } = calendarDateIn(start_time, timeZone);
  // Calendar-date subtraction on a UTC-anchored day count is DST-free. A negative lead_time_days
  // (HKCP's overseas rule, recognised up to 2 months AFTER the event) lands after the event unchanged.
  const d = new Date(Date.UTC(year, month - 1, day) - leadDays * DAY_MS);
  const deadline = endOfLocalDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), timeZone);

  return { deadline, passed: Date.now() > deadline.getTime() };
}
