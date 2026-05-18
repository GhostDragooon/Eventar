import { describe, it, expect } from 'vitest';
import { reduceTimeRange, formatHour, durationLabel } from './time-range';

// Helpers: states are (startHour, endHour) where either may be null.
// `reduceTimeRange(state, clickedHour)` returns the next state per the UX
// rules approved during brainstorming:
//   - Empty + click X  → (X, null)
//   - Start only + click Y (Y > start)  → (start, Y), range filled
//   - Start only + click Y (Y < start)  → swap: (Y, start)
//   - Start only + click X again        → cleared (null, null)
//   - Range set    + click start endpoint → cleared
//   - Range set    + click end endpoint   → cleared
//   - Range set    + click any other      → restart with (clicked, null)

describe('reduceTimeRange', () => {
  it('empty + click sets start', () => {
    expect(reduceTimeRange([null, null], 9)).toEqual([9, null]);
  });

  it('start-only + click later hour completes the range', () => {
    expect(reduceTimeRange([9, null], 17)).toEqual([9, 17]);
  });

  it('start-only + click earlier hour swaps so start < end', () => {
    expect(reduceTimeRange([14, null], 9)).toEqual([9, 14]);
  });

  it('start-only + click the same start hour clears', () => {
    expect(reduceTimeRange([9, null], 9)).toEqual([null, null]);
  });

  it('complete range + click the start endpoint clears', () => {
    expect(reduceTimeRange([9, 17], 9)).toEqual([null, null]);
  });

  it('complete range + click the end endpoint clears', () => {
    expect(reduceTimeRange([9, 17], 17)).toEqual([null, null]);
  });

  it('complete range + click any other chip restarts from that chip', () => {
    expect(reduceTimeRange([9, 17], 11)).toEqual([11, null]);
    expect(reduceTimeRange([9, 17], 19)).toEqual([19, null]);
  });
});

describe('formatHour', () => {
  it('formats a 24h hour number as HH:00', () => {
    expect(formatHour(8)).toBe('08:00');
    expect(formatHour(9)).toBe('09:00');
    expect(formatHour(13)).toBe('13:00');
    expect(formatHour(20)).toBe('20:00');
  });
});

describe('durationLabel', () => {
  it('returns empty string when range is incomplete', () => {
    expect(durationLabel(null, null)).toBe('');
    expect(durationLabel(9, null)).toBe('');
  });

  it('formats whole-hour durations with h suffix', () => {
    expect(durationLabel(9, 17)).toBe('8h');
    expect(durationLabel(8, 9)).toBe('1h');
    expect(durationLabel(10, 11)).toBe('1h');
  });

  it('formats multi-hour durations', () => {
    expect(durationLabel(8, 20)).toBe('12h');
  });

  it('returns "0h" if start equals end (shouldnt happen via reducer but defensive)', () => {
    expect(durationLabel(10, 10)).toBe('0h');
  });
});
