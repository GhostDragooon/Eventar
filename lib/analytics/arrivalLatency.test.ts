import { describe, expect, it } from 'vitest';
import { arrivalLatency } from './arrivalLatency';

const START = new Date('2026-06-01T10:00:00Z').toISOString();

describe('arrivalLatency', () => {
  it('returns null when no one has checked in', () => {
    expect(arrivalLatency([], START)).toBeNull();
    expect(arrivalLatency([{ check_in_at: null }, { check_in_at: null }], START)).toBeNull();
  });

  it('counts only check_in_at within 15 minutes after start_time', () => {
    const rows = [
      { check_in_at: '2026-06-01T10:00:00Z' }, // on time
      { check_in_at: '2026-06-01T10:14:59Z' }, // 14:59 after — IN
      { check_in_at: '2026-06-01T10:15:01Z' }, // 15:01 after — OUT
      { check_in_at: '2026-06-01T10:30:00Z' }, // 30 min after — OUT
    ];
    expect(arrivalLatency(rows, START)).toBe(0.5);
  });

  it('includes early arrivals (negative latency) as "on time"', () => {
    const rows = [
      { check_in_at: '2026-06-01T09:55:00Z' }, // 5 min early — IN
      { check_in_at: '2026-06-01T10:30:00Z' }, // 30 min after — OUT
    ];
    expect(arrivalLatency(rows, START)).toBe(0.5);
  });

  it('null check_in_at rows do not affect the denominator', () => {
    const rows = [
      { check_in_at: '2026-06-01T10:00:00Z' },
      { check_in_at: null },
    ];
    expect(arrivalLatency(rows, START)).toBe(1);
  });
});
