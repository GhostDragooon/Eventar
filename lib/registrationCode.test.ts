import { describe, expect, it } from 'vitest';
import { generateRegistrationCode, isValidRegistrationCode } from './registrationCode';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const FORMAT_RE = /^WK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

describe('generateRegistrationCode', () => {
  it('always returns the WK-XXXX format', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRegistrationCode()).toMatch(FORMAT_RE);
    }
  });

  it('only uses characters from the 31-char ambiguity-stripped alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRegistrationCode();
      const body = code.slice(3); // strip "WK-"
      for (const ch of body) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  it('covers most of the alphabet over a large sample (distribution sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      for (const ch of generateRegistrationCode().slice(3)) seen.add(ch);
    }
    // 10k iterations × 4 chars = 40k char draws; ~99.999% chance every
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
  });

  it('rejects banned alphabet chars', () => {
    expect(isValidRegistrationCode('WK-0OIL')).toBe(false);
    expect(isValidRegistrationCode('WK-1L1L')).toBe(false);
  });

  it('rejects wrong-length codes', () => {
    expect(isValidRegistrationCode('WK-AB')).toBe(false);
    expect(isValidRegistrationCode('WK-ABCDE')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(isValidRegistrationCode('XX-2345')).toBe(false);
    expect(isValidRegistrationCode('WK2345')).toBe(false); // missing dash
  });

  it('rejects empty string', () => {
    expect(isValidRegistrationCode('')).toBe(false);
  });
});
