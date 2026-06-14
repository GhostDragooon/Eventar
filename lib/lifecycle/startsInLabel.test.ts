import { describe, expect, it } from 'vitest';
import { startsInLabel } from './startsInLabel';

const START = new Date('2026-06-14T10:00:00Z').getTime();

describe('startsInLabel', () => {
  it('renders "Starts in Xm" when now is before start', () => {
    // 4 minutes before start
    const now = START - 4 * 60_000;
    expect(startsInLabel(START, now)).toBe('Starts in 4m');
  });

  it('renders hours+minutes when more than an hour before start', () => {
    // 2h 15m before start
    const now = START - (2 * 60 + 15) * 60_000;
    expect(startsInLabel(START, now)).toBe('Starts in 2h 15m');
  });

  it('renders whole hours without trailing 0m', () => {
    // exactly 2h before
    const now = START - 2 * 60 * 60_000;
    expect(startsInLabel(START, now)).toBe('Starts in 2h');
  });

  it('renders days+hours when more than 24h before', () => {
    // 1d 4h before
    const now = START - (28 * 60) * 60_000;
    expect(startsInLabel(START, now)).toBe('Starts in 1d 4h');
  });

  it('renders "Starts in <1m" when within a minute of start', () => {
    // 30s before
    const now = START - 30_000;
    expect(startsInLabel(START, now)).toBe('Starts in <1m');
  });

  it('flips to "Started Xm ago" once start has passed', () => {
    // 4 minutes after start
    const now = START + 4 * 60_000;
    expect(startsInLabel(START, now)).toBe('Started 4m ago');
  });

  it('renders hours+minutes after start', () => {
    // 1h 30m after start
    const now = START + (90 * 60_000);
    expect(startsInLabel(START, now)).toBe('Started 1h 30m ago');
  });

  it('renders "Started <1m ago" at the boundary', () => {
    // 30s after start
    const now = START + 30_000;
    expect(startsInLabel(START, now)).toBe('Started <1m ago');
  });

  it('handles exactly-at-start as "Started <1m ago"', () => {
    expect(startsInLabel(START, START)).toBe('Started <1m ago');
  });
});
