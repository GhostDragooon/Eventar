import { describe, expect, it } from 'vitest';
import { timezoneForJurisdiction } from './jurisdictionTz';

describe('timezoneForJurisdiction', () => {
  it('maps the jurisdictions the platform has', () => {
    expect(timezoneForJurisdiction('HK')).toBe('Asia/Hong_Kong');
    expect(timezoneForJurisdiction('AU')).toBe('Australia/Sydney');
  });
  it('is case-insensitive and returns null for an unknown or missing jurisdiction', () => {
    expect(timezoneForJurisdiction('hk')).toBe('Asia/Hong_Kong');
    expect(timezoneForJurisdiction('ZZ')).toBeNull();
    expect(timezoneForJurisdiction(null)).toBeNull();
    expect(timezoneForJurisdiction(undefined)).toBeNull();
  });
});
