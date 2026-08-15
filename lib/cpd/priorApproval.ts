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
 * Anchored to Hong Kong local time (UTC+8), never the event's own timezone
 * or bare UTC: this is a Hong Kong regulator's deadline, and for a legal
 * deadline the calendar day IS the point — an event starting at 00:30 HKT
 * is still the previous calendar day in UTC.
 */

export type PriorApproval = { deadline: Date; passed: boolean };

const HK_TIMEZONE = 'Asia/Hong_Kong';
const DAY_MS = 86_400_000;

function hongKongCalendarDate(iso: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(m.year), month: Number(m.month), day: Number(m.day) };
}

export function priorApprovalDeadline(start_time: string, cycle_config: unknown): PriorApproval | null {
  const leadDays = (
    cycle_config as { prior_approval?: { lead_time_days?: unknown } } | null | undefined
  )?.prior_approval?.lead_time_days;
  if (typeof leadDays !== 'number' || !Number.isFinite(leadDays)) return null;

  const { year, month, day } = hongKongCalendarDate(start_time);
  // Day-granular arithmetic on a UTC-anchored timestamp is DST-free and
  // exact — this is calendar-date subtraction, not yet a real moment.
  // A negative lead_time_days (e.g. HKCP's overseas rule, recognised up to
  // 2 months AFTER the event) lands the deadline after the event, which
  // this same subtraction handles without a special case.
  const eventDayAnchor = Date.UTC(year, month - 1, day);
  const deadlineDayAnchor = new Date(eventDayAnchor - leadDays * DAY_MS);

  // The deadline is "by end of that HK calendar day" — 23:59:59.999 HKT,
  // which is 15:59:59.999 UTC the same day (HKT = UTC+8).
  const deadline = new Date(
    Date.UTC(
      deadlineDayAnchor.getUTCFullYear(),
      deadlineDayAnchor.getUTCMonth(),
      deadlineDayAnchor.getUTCDate(),
      15, 59, 59, 999,
    ),
  );

  return { deadline, passed: Date.now() > deadline.getTime() };
}
