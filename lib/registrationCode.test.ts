import { describe, expect, it } from 'vitest';
import { generateRegistrationCode, isValidRegistrationCode } from './registrationCode';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
// New generations are now UNPREFIXED (DEFERRED 51 — the `WK-` workshop prefix
// was visible on every regulator-facing export; dropped 2026-08-27). Existing
// rows keep their prefix, so the validator still grandfathers `WK-…`.
const NEW_FORMAT_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

describe('generateRegistrationCode', () => {
  it('returns the unprefixed 6-char format', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRegistrationCode()).toMatch(NEW_FORMAT_RE);
    }
  });

  it('only uses characters from the 31-char ambiguity-stripped alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRegistrationCode();
      for (const ch of code) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  it('covers most of the alphabet over a large sample (distribution sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      for (const ch of generateRegistrationCode()) seen.add(ch);
    }
    // 10k iterations × 6 chars = 60k char draws; ~99.9999% chance every
    // alphabet char appears at least once. If <28 of 31 appear, RNG is
    // probably broken.
    expect(seen.size).toBeGreaterThanOrEqual(28);
  });
});

describe('isValidRegistrationCode', () => {
  it('accepts every output of generateRegistrationCode', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(isValidRegistrationCode(generateRegistrationCode())).toBe(true);
    }
  });

  it('rejects lowercase variants', () => {
    expect(isValidRegistrationCode('wk-2345')).toBe(false);
    expect(isValidRegistrationCode('abcdef')).toBe(false);
  });

  it('rejects banned alphabet chars', () => {
    expect(isValidRegistrationCode('0OILAB')).toBe(false);
    expect(isValidRegistrationCode('WK-0OIL')).toBe(false);
    expect(isValidRegistrationCode('WK-1L1L')).toBe(false);
  });

  it('rejects wrong-length codes', () => {
    expect(isValidRegistrationCode('AB')).toBe(false);
    expect(isValidRegistrationCode('ABCDE')).toBe(false);
    expect(isValidRegistrationCode('WK-AB')).toBe(false);
    expect(isValidRegistrationCode('WK-ABCDE')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(isValidRegistrationCode('XX-2345')).toBe(false);
    // Note: pre-DEFERRED-51 this suite also rejected 'WK2345' as "missing
    // dash". With the new unprefixed 6-char form, `WK2345` is now a valid
    // code (six alphabet chars), so it is no longer disambiguable from a
    // fat-fingered prefix. Left in place as a note, not a test case.
  });

  it('rejects empty string', () => {
    expect(isValidRegistrationCode('')).toBe(false);
  });

  it('accepts grandfathered legacy shapes for the lifetime of existing rows', () => {
    // 20260523010000_init_checkin_columns backfilled existing registrations
    // with 4-char `WK-XXXX` codes; the CSPRNG swap then wrote `WK-XXXXXX`
    // codes; DEFERRED 51 (2026-08-27) then dropped the prefix for new codes.
    // All three shapes coexist while pre-2026-08-27 events are still live.
    expect(isValidRegistrationCode('WK-2345')).toBe(true);
    expect(isValidRegistrationCode('WK-WXYZ')).toBe(true);
    expect(isValidRegistrationCode('WK-2345AB')).toBe(true);
    expect(isValidRegistrationCode('WK-K7QMWX')).toBe(true);
  });
});
