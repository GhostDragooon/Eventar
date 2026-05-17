export type Duration = '30m' | '1h' | '2h' | '4h' | '8h' | 'custom';

const MINUTES: Record<Exclude<Duration, 'custom'>, number> = {
  '30m':  30,
  '1h':   60,
  '2h':  120,
  '4h':  240,
  '8h':  480,
};

/**
 * Compute event end time from a start time (HH:MM 24h) and a duration chip.
 * Returns '' when inputs are insufficient (caller treats as "not yet ready").
 * Clamps to 23:59 if start + duration would cross midnight; we don't schedule
 * multi-day events in Phase 1.5, and Zod's end>start refinement surfaces the
 * issue downstream.
 */
export function deriveEnd(
  startTime: string,
  duration: Duration,
  customEnd: string,
): string {
  if (duration === 'custom') return customEnd;
  if (!startTime) return '';

  const [hStr, mStr] = startTime.split(':');
  const startMins = Number(hStr) * 60 + Number(mStr);
  if (Number.isNaN(startMins)) return '';

  const endMins = Math.min(startMins + MINUTES[duration], 23 * 60 + 59);
  const h = Math.floor(endMins / 60);
  const m = endMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
