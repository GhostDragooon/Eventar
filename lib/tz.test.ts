import { describe, expect, it } from 'vitest';
import { formatInTz, browserTz } from './tz';

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
