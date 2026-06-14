/**
 * Tablet-check-in scoreboard countdown (E.4 / G10).
 *
 * Pure derivation — no schema, no Intl tricks: returns a short human label
 * for the time until (or since) `startMs`. Before start: "Starts in 4m" /
 * "Starts in 2h 15m" / "Starts in 1d 4h". After start: "Started 4m ago" /
 * "Started 1h 30m ago". Sub-minute resolution collapses to "<1m" on both
 * sides so the tablet UI never shows a blank countdown at the boundary.
 *
 * The doors-open phrase ("Doors open in N min" = start − 60min) is
 * deliberately NOT rendered here — G10 spec says "or omit", and the TC
 * scoreboard already carries the Live lifecycle pill which conveys the
 * same operational signal.
 */
export function startsInLabel(startMs: number, nowMs: number): string {
  const deltaMs = startMs - nowMs;
  if (deltaMs <= 0) {
    const ago = -deltaMs;
    return `Started ${formatDuration(ago)} ago`;
  }
  return `Starts in ${formatDuration(deltaMs)}`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return '<1m';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hoursAfterDays = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hoursAfterDays > 0 ? `${days}d ${hoursAfterDays}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
