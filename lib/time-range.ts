// Pure state machine for the Date & Time section's range picker.
// Hours are stored as 24-hour integers (8 = 08:00, 17 = 17:00).
// State shape: [startHour, endHour]; either may be null.

export type TimeRangeState = [number | null, number | null];

/**
 * Reduce a click on hour `clicked` against the current range state.
 * UX rules (from brainstorming, 2026-05-17):
 *   - empty + click X        → (X, null)
 *   - start-only + click Y, Y > start → (start, Y)
 *   - start-only + click Y, Y < start → swap (Y, start)
 *   - start-only + click start → clear
 *   - range set  + click either endpoint → clear
 *   - range set  + click any other chip → restart with (clicked, null)
 */
export function reduceTimeRange(
  state: TimeRangeState,
  clicked: number,
): TimeRangeState {
  const [start, end] = state;

  if (start === null) {
    return [clicked, null];
  }

  if (end === null) {
    if (clicked === start) return [null, null];
    return clicked > start ? [start, clicked] : [clicked, start];
  }

  // range set
  if (clicked === start || clicked === end) return [null, null];
  return [clicked, null];
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function durationLabel(start: number | null, end: number | null): string {
  if (start === null || end === null) return '';
  return `${end - start}h`;
}
