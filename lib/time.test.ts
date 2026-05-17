import { describe, it, expect } from 'vitest';
import { deriveEnd } from './time';

describe('deriveEnd', () => {
  it('returns empty string when start time is missing', () => {
    expect(deriveEnd('', '1h', '')).toBe('');
  });

  it('adds 30m correctly', () => {
    expect(deriveEnd('09:00', '30m', '')).toBe('09:30');
  });

  it('adds 1h correctly', () => {
    expect(deriveEnd('09:00', '1h', '')).toBe('10:00');
  });

  it('adds 2h correctly', () => {
    expect(deriveEnd('13:30', '2h', '')).toBe('15:30');
  });

  it('adds 4h correctly', () => {
    expect(deriveEnd('09:00', '4h', '')).toBe('13:00');
  });

  it('adds 8h correctly', () => {
    expect(deriveEnd('09:00', '8h', '')).toBe('17:00');
  });

  it('returns customEnd verbatim when duration is "custom"', () => {
    expect(deriveEnd('09:00', 'custom', '14:45')).toBe('14:45');
  });

  it('returns empty string when duration is "custom" but customEnd is empty', () => {
    expect(deriveEnd('09:00', 'custom', '')).toBe('');
  });

  it('clamps to 23:59 on midnight crossover so Zod end>start surfaces it', () => {
    expect(deriveEnd('23:30', '1h', '')).toBe('23:59');
  });

  it('zero-pads single-digit hours and minutes', () => {
    expect(deriveEnd('08:00', '30m', '')).toBe('08:30');
    expect(deriveEnd('09:05', '30m', '')).toBe('09:35');
  });
});
