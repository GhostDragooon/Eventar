import { describe, expect, it } from 'vitest';
import { arrivalBuckets } from './arrivalBuckets';

const MIN = 60_000;

describe('arrivalBuckets', () => {
  const doorOpen = Date.parse('2026-07-01T08:00:00Z');

  it('buckets arrivals into 5-minute slots from door open', () => {
    const untilMs = doorOpen + 30 * MIN;
    const h = arrivalBuckets(
      [
        new Date(doorOpen + 1 * MIN).toISOString(), // bucket 0
        new Date(doorOpen + 6 * MIN).toISOString(), // bucket 1
        new Date(doorOpen + 7 * MIN).toISOString(), // bucket 1
        new Date(doorOpen + 26 * MIN).toISOString(), // bucket 5
      ],
      doorOpen,
      untilMs,
    );
    expect(h.bucketMinutes).toBe(5);
    expect(h.buckets).toHaveLength(6);
    expect(h.buckets[0]).toBe(1);
    expect(h.buckets[1]).toBe(2);
    expect(h.buckets[5]).toBe(1);
    expect(h.peakIndex).toBe(1);
    expect(h.peakCount).toBe(2);
  });

  it('ignores nulls and out-of-window timestamps', () => {
    const untilMs = doorOpen + 10 * MIN;
    const h = arrivalBuckets(
      [null, new Date(doorOpen - 5 * MIN).toISOString(), new Date(doorOpen + 20 * MIN).toISOString()],
      doorOpen,
      untilMs,
    );
    expect(h.buckets.reduce((a, b) => a + b, 0)).toBe(0);
    expect(h.peakIndex).toBeNull();
  });

  it('widens buckets on long spans to stay readable', () => {
    const untilMs = doorOpen + 9 * 60 * MIN; // 9 hours → 108 five-min buckets
    const h = arrivalBuckets([], doorOpen, untilMs);
    expect(h.buckets.length).toBeLessThanOrEqual(48);
    expect(h.bucketMinutes).toBeGreaterThan(5);
  });

  it('clamps an arrival exactly at untilMs into the last bucket', () => {
    const untilMs = doorOpen + 10 * MIN;
    const h = arrivalBuckets([new Date(untilMs).toISOString()], doorOpen, untilMs);
    expect(h.buckets[h.buckets.length - 1]).toBe(1);
  });
});
