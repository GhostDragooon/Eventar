import { describe, expect, it } from 'vitest';
import { formatInTz, formatInTzWithZone, isoInTz, resolveViewerTz, browserTz, tzFromCoords } from './tz';

describe('formatInTz', () => {
  it('formats UTC ISO in Europe/Berlin (summer DST = UTC+2)', () => {
    expect(formatInTz('2026-06-15T09:00:00Z', 'Europe/Berlin'))
      .toBe('15 Jun 2026, 11:00');
  });
  it('formats UTC ISO in America/New_York (summer DST = UTC-4)', () => {
    expect(formatInTz('2026-06-15T09:00:00Z', 'America/New_York'))
      .toBe('15 Jun 2026, 05:00');
  });
  it('handles UTC explicitly', () => {
    expect(formatInTz('2026-06-15T09:00:00Z', 'UTC'))
      .toBe('15 Jun 2026, 09:00');
  });
});

describe('formatInTzWithZone', () => {
  // The zone label is the event's own zone, short, en-GB (Ivan 2026-11-02, pick 2a). It depends on the instant
  // (DST), so each case names its date.
  it.each([
    ['Asia/Hong_Kong', '2026-12-14T01:00:00Z', '14 Dec 2026, 09:00 (GMT+8)'],
    ['America/New_York', '2026-12-14T14:00:00Z', '14 Dec 2026, 09:00 (GMT-5)'],
    ['America/New_York', '2026-06-15T13:00:00Z', '15 Jun 2026, 09:00 (GMT-4)'],
    ['Europe/London', '2026-12-14T09:00:00Z', '14 Dec 2026, 09:00 (GMT)'],
    ['Europe/London', '2026-06-15T08:00:00Z', '15 Jun 2026, 09:00 (BST)'],
    ['UTC', '2026-12-14T09:00:00Z', '14 Dec 2026, 09:00 (UTC)'],
  ])('%s at %s', (zone, iso, expected) => {
    expect(formatInTzWithZone(iso, zone)).toBe(expected);
  });
});

describe('browserTz', () => {
  it('returns a non-empty string', () => {
    const tz = browserTz();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});

describe('tzFromCoords', () => {
  it('returns Europe/Berlin for Berlin coords', () => {
    expect(tzFromCoords(52.52, 13.405)).toBe('Europe/Berlin');
  });
  it('returns America/New_York for NYC coords', () => {
    expect(tzFromCoords(40.7128, -74.0060)).toBe('America/New_York');
  });
  it('returns Asia/Tokyo for Tokyo coords', () => {
    expect(tzFromCoords(35.6762, 139.6503)).toBe('Asia/Tokyo');
  });
});

describe('isoInTz', () => {
  it('prints the venue wall clock with its offset, not UTC', () => {
    expect(isoInTz('2026-12-04T01:00:00+00:00', 'Asia/Hong_Kong')).toBe('2026-12-04T09:00:00+08:00');
  });
  it('follows daylight saving per instant', () => {
    expect(isoInTz('2026-01-15T17:00:00Z', 'America/New_York')).toBe('2026-01-15T12:00:00-05:00');
    expect(isoInTz('2026-07-15T16:00:00Z', 'America/New_York')).toBe('2026-07-15T12:00:00-04:00');
  });
  it('keeps a half-hour offset and UTC', () => {
    expect(isoInTz('2026-12-04T00:00:00Z', 'Asia/Kolkata')).toBe('2026-12-04T05:30:00+05:30');
    expect(isoInTz('2026-12-04T00:00:00Z', 'UTC')).toBe('2026-12-04T00:00:00+00:00');
  });
});

describe('resolveViewerTz', () => {
  it('prefers the browser zone, then the IP zone, then the event zone', () => {
    expect(resolveViewerTz(['Europe/Berlin', 'Asia/Tokyo'], 'Asia/Hong_Kong')).toBe('Europe/Berlin');
    expect(resolveViewerTz([undefined, 'Asia/Tokyo'], 'Asia/Hong_Kong')).toBe('Asia/Tokyo');
    expect(resolveViewerTz([null, undefined], 'Asia/Hong_Kong')).toBe('Asia/Hong_Kong');
  });
  it('skips a value that is not a real zone', () => {
    expect(resolveViewerTz(['Not/AZone', 'Asia/Tokyo'], 'Asia/Hong_Kong')).toBe('Asia/Tokyo');
    expect(resolveViewerTz(['<script>'], 'Asia/Hong_Kong')).toBe('Asia/Hong_Kong');
  });
});
