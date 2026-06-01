import { describe, expect, it, vi } from 'vitest';
// rateLimit.ts has `import 'server-only'` which throws in non-server contexts.
// Same neutralisation pattern as auth.test.ts.
vi.mock('server-only', () => ({}));

import { parseClientIp, windowStartMs } from './rateLimit';

describe('parseClientIp', () => {
  it('returns the first IP from x-forwarded-for', () => {
    expect(parseClientIp({ xff: '1.2.3.4', xRealIp: null })).toBe('1.2.3.4');
  });

  it('strips downstream proxies from x-forwarded-for', () => {
    // XFF format is "client, proxy1, proxy2" — first hop is the original client.
    expect(parseClientIp({ xff: '1.2.3.4, 5.6.7.8', xRealIp: null })).toBe('1.2.3.4');
  });

  it('trims whitespace from XFF values', () => {
    expect(parseClientIp({ xff: '  1.2.3.4  , 5.6.7.8', xRealIp: null })).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when XFF is missing', () => {
    expect(parseClientIp({ xff: null, xRealIp: '9.8.7.6' })).toBe('9.8.7.6');
  });

  it('returns "unknown" when both headers are missing', () => {
    // The "unknown" bucket is shared across all unidentified callers — minor
    // risk in dev; Vercel always sets XFF in production.
    expect(parseClientIp({ xff: null, xRealIp: null })).toBe('unknown');
  });

  it('prefers XFF over x-real-ip when both are present', () => {
    expect(parseClientIp({ xff: '1.2.3.4', xRealIp: '9.8.7.6' })).toBe('1.2.3.4');
  });
});

describe('windowStartMs', () => {
  it('aligns to the window boundary', () => {
    expect(windowStartMs(1000, 60_000)).toBe(0);
    expect(windowStartMs(60_000, 60_000)).toBe(60_000);
    expect(windowStartMs(60_500, 60_000)).toBe(60_000);
    expect(windowStartMs(120_000, 60_000)).toBe(120_000);
  });

  it('handles different window sizes', () => {
    expect(windowStartMs(15_000, 10_000)).toBe(10_000);
    expect(windowStartMs(15_000, 5_000)).toBe(15_000);
  });

  it('aligns ms-level timestamps correctly', () => {
    // 1717180815000 is some real-ish ms timestamp; 60_000-ms window aligns
    // it down to the nearest minute boundary.
    expect(windowStartMs(1_717_180_815_000, 60_000)).toBe(1_717_180_800_000);
  });
});
