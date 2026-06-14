import { describe, expect, it } from 'vitest';
import { ringDashArray, RING_CIRCUMFERENCE, ringFraction } from './ringMath';

describe('ringFraction', () => {
  it('returns 0 when max is 0 (no denominator)', () => {
    expect(ringFraction(0, 0)).toBe(0);
  });

  it('returns 0 when max is negative (defensive)', () => {
    expect(ringFraction(5, -1)).toBe(0);
  });

  it('returns 0 when value is null/undefined-equivalent (NaN)', () => {
    expect(ringFraction(NaN, 10)).toBe(0);
  });

  it('clamps value at max (cannot exceed 1.0 fill)', () => {
    expect(ringFraction(15, 10)).toBe(1);
  });

  it('clamps value at 0 (cannot go below 0)', () => {
    expect(ringFraction(-3, 10)).toBe(0);
  });

  it('returns a proportional fraction in [0, 1]', () => {
    expect(ringFraction(5, 10)).toBe(0.5);
    expect(ringFraction(3, 4)).toBeCloseTo(0.75, 5);
  });
});

describe('ringDashArray', () => {
  it('returns "0 C" for an empty ring', () => {
    expect(ringDashArray(0, 10)).toBe(`0 ${RING_CIRCUMFERENCE}`);
  });

  it('returns "C 0" for a full ring (value === max)', () => {
    expect(ringDashArray(10, 10)).toBe(`${RING_CIRCUMFERENCE} 0`);
  });

  it('returns half-filled dasharray for value/max=1/2', () => {
    const expected = RING_CIRCUMFERENCE / 2;
    const [filled, rest] = ringDashArray(1, 2).split(' ').map(Number);
    expect(filled).toBeCloseTo(expected, 5);
    expect(rest).toBeCloseTo(RING_CIRCUMFERENCE - expected, 5);
  });

  it('the two segments always sum to the circumference', () => {
    for (const [v, m] of [[1, 3], [2, 7], [5, 9], [0, 1]] as const) {
      const [a, b] = ringDashArray(v, m).split(' ').map(Number);
      expect(a + b).toBeCloseTo(RING_CIRCUMFERENCE, 4);
    }
  });

  it('treats max=0 as an empty ring (no NaN leak)', () => {
    expect(ringDashArray(5, 0)).toBe(`0 ${RING_CIRCUMFERENCE}`);
  });
});
