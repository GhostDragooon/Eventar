import { describe, expect, it } from 'vitest';
import { formatInTz, browserTz, tzFromCoords } from './tz';

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
