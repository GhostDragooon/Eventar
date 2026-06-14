/**
 * Ring-gauge math for `components/analytics/RingGauge.tsx`. Kept as a pure
 * helper so the dasharray fraction can be unit-tested without rendering.
 *
 * The ring is drawn with `r = RING_RADIUS`, so its circumference is fixed.
 * Stroke-dasharray "<filled> <rest>" walks the stroke around the circle; the
 * caller rotates -90deg so the fill starts at 12 o'clock.
 */
export const RING_RADIUS = 36;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ringFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max)) return 0;
  if (max <= 0) return 0;
  if (value <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

export function ringDashArray(value: number, max: number): string {
  const f = ringFraction(value, max);
  const filled = f * RING_CIRCUMFERENCE;
  const rest = RING_CIRCUMFERENCE - filled;
  return `${filled} ${rest}`;
}
