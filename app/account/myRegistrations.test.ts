import { describe, expect, it } from 'vitest';
import { bucketOf, opensWithinADay, splitRegistrations } from './myRegistrations';
import type { AttendanceRecordView } from './schema';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-01T06:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const reg = (over: Partial<AttendanceRecordView> & { start?: number; end?: number }): AttendanceRecordView => {
  const { start = 5 * HOUR, end = 7 * HOUR, ...rest } = over;
  return {
    registration_id: `r-${Math.random()}`,
    event_id: 'e1',
    event_title: 'Event',
    event_start: iso(start),
    event_end: iso(end),
    event_published: true,
    event_timezone: 'Asia/Hong_Kong',
    registration_code: 'ABC234',
    status: 'registered',
    check_in_at: null,
    check_in_method: null,
    source: 'self_registration',
    has_credit: false,
    ...rest,
  };
};

describe('bucketOf: the same check-in window the database enforces', () => {
  it('upcoming until 60 minutes before the start', () => {
    expect(bucketOf(reg({ start: 61 * 60_000, end: 3 * HOUR }), NOW)).toBe('upcoming');
  });
  it('live from 60 minutes before the start (inclusive) until the end (exclusive)', () => {
    expect(bucketOf(reg({ start: 60 * 60_000, end: 3 * HOUR }), NOW)).toBe('live');
    expect(bucketOf(reg({ start: -HOUR, end: 1 }), NOW)).toBe('live');
    expect(bucketOf(reg({ start: -HOUR, end: 0 }), NOW)).toBe('past');
  });
  it('a cancelled registration is history even for a future event', () => {
    expect(bucketOf(reg({ status: 'cancelled' }), NOW)).toBe('past');
  });
  it('an event the organiser cancelled, unpublished or deleted is history; its registration row is untouched', () => {
    expect(bucketOf(reg({ event_published: false }), NOW)).toBe('past');
    expect(bucketOf(reg({ event_published: false, start: -HOUR, end: HOUR }), NOW)).toBe('past');
  });
  it('an event we cannot resolve is history, never an upcoming sign-up we cannot describe', () => {
    expect(bucketOf(reg({ event_start: null, event_end: null, event_title: null }), NOW)).toBe('past');
  });
  it('an attended registration of a live event stays live; once it ends it is history', () => {
    expect(bucketOf(reg({ status: 'attended', start: -HOUR, end: HOUR }), NOW)).toBe('live');
    expect(bucketOf(reg({ status: 'attended', start: -3 * HOUR, end: -HOUR }), NOW)).toBe('past');
  });
});

describe('splitRegistrations', () => {
  it('sorts live and upcoming soonest first and keeps each registration in exactly one bucket', () => {
    const a = reg({ start: 40 * HOUR, end: 42 * HOUR, event_title: 'later' });
    const b = reg({ start: 10 * HOUR, end: 12 * HOUR, event_title: 'sooner' });
    const c = reg({ start: -5 * HOUR, end: -3 * HOUR, event_title: 'over' });
    const { live, upcoming, past } = splitRegistrations([a, b, c], NOW);
    expect(upcoming.map((r) => r.event_title)).toEqual(['sooner', 'later']);
    expect(past.map((r) => r.event_title)).toEqual(['over']);
    expect(live).toEqual([]);
  });
});

describe('opensWithinADay', () => {
  it('is true for an upcoming event whose window opens within 24 hours, false beyond and for live ones', () => {
    expect(opensWithinADay(reg({ start: 5 * HOUR, end: 7 * HOUR }), NOW)).toBe(true);
    expect(opensWithinADay(reg({ start: 26 * HOUR, end: 28 * HOUR }), NOW)).toBe(false);
    // the window opens 60 minutes before the start: a start 25 h away opens exactly 24 h from now
    expect(opensWithinADay(reg({ start: 25 * HOUR, end: 27 * HOUR }), NOW)).toBe(true);
    expect(opensWithinADay(reg({ start: 25 * HOUR + 1, end: 27 * HOUR }), NOW)).toBe(false);
    expect(opensWithinADay(reg({ start: 0, end: HOUR }), NOW)).toBe(false);
  });
});
