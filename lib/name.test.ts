import { describe, expect, it } from 'vitest';
import { firstName } from './name';

describe('firstName', () => {
  it('returns first token of a two-token name', () => {
    expect(firstName('Jane Doe')).toBe('Jane');
  });

  it('trims surrounding whitespace and collapses internal whitespace splits', () => {
    expect(firstName('  Jane  Doe  ')).toBe('Jane');
  });

  it('returns the single token when only one is present', () => {
    expect(firstName('Cher')).toBe('Cher');
  });

  it('returns empty string for empty input', () => {
    expect(firstName('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(firstName('   ')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(firstName(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(firstName(undefined)).toBe('');
  });

  it('preserves hyphenated first names — splits on whitespace only', () => {
    expect(firstName('Jane-Pierre Levy')).toBe('Jane-Pierre');
  });
});
