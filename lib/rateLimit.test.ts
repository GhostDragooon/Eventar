import { beforeEach, describe, expect, it, vi } from 'vitest';
// rateLimit.ts has `import 'server-only'` which throws in non-server contexts.
// Same neutralisation pattern as auth.test.ts.
vi.mock('server-only', () => ({}));

const { mockRpc, mockRecordAbuseHit } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRecordAbuseHit: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('./supabase/admin', () => ({ supabaseAdmin: () => ({ rpc: mockRpc }) }));
// rateLimitBySession imports this dynamically; vi.mock covers dynamic imports.
vi.mock('./abuseTier', () => ({ recordAbuseHitAndMaybeRevoke: mockRecordAbuseHit }));

import { composeRateKey, parseClientIp, rateLimit, rateLimitBySession, windowStartMs } from './rateLimit';

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

describe('composeRateKey', () => {
  it('rateLimitBySession composes scope:session key', () => {
    expect(composeRateKey('sessionAbuse', 'sess_abc')).toBe('sessionAbuse:sess_abc');
  });

  it('rateLimitByUser composes scope:user key', () => {
    expect(composeRateKey('sessionAbuse', 'user_123')).toBe('sessionAbuse:user_123');
  });
});

// rate_limit_check counts every call, rejected ones included, and allows while
// count <= max. So with max 5, count 6 is the first rejection in the window.
const OPTS = { windowMs: 60_000, max: 5 };
const checkReturns = (count: number) =>
  mockRpc.mockResolvedValueOnce({ data: { allowed: count <= OPTS.max, count }, error: null });

describe('rateLimit firstRejection', () => {
  beforeEach(() => mockRpc.mockReset());

  it('marks only the first call over the limit (count == max + 1)', async () => {
    checkReturns(6);
    expect(await rateLimit('k', OPTS)).toMatchObject({ allowed: false, firstRejection: true });
    checkReturns(7);
    expect(await rateLimit('k', OPTS)).toMatchObject({ allowed: false, firstRejection: false });
  });
});

describe('rateLimitBySession → §4 abuse tier (Decisions Log Item 11)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRecordAbuseHit.mockReset();
  });

  it('records one abuse hit on the first rejection in a window', async () => {
    checkReturns(6);
    mockRecordAbuseHit.mockResolvedValueOnce({ revoked: false });
    const r = await rateLimitBySession('account.update', 'user-1', OPTS);
    expect(r.allowed).toBe(false);
    expect(mockRecordAbuseHit).toHaveBeenCalledTimes(1);
  });

  it('reports sessionRevoked when the hit signed the user out, so the action can say so', async () => {
    checkReturns(6);
    mockRecordAbuseHit.mockResolvedValueOnce({ revoked: true });
    const r = await rateLimitBySession('account.update', 'user-1', OPTS);
    expect(r).toMatchObject({ allowed: false, sessionRevoked: true });
  });

  it('abuseTier: false (read / page-render limiters) still rate-limits but never feeds the tier', async () => {
    checkReturns(6);
    const r = await rateLimitBySession('account.unlinked_count', 'user-1', { ...OPTS, abuseTier: false });
    expect(r.allowed).toBe(false);
    expect(mockRecordAbuseHit).not.toHaveBeenCalled();
  });

  it('does not record a hit for allowed calls or for later rejections (UI retries do not stack)', async () => {
    checkReturns(1);
    await rateLimitBySession('account.update', 'user-1', OPTS);
    checkReturns(7);
    await rateLimitBySession('account.update', 'user-1', OPTS);
    expect(mockRecordAbuseHit).not.toHaveBeenCalled();
  });

  it('an abuse-tier failure is logged and the rejection still returns (no 500)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkReturns(6);
    mockRecordAbuseHit.mockRejectedValueOnce(new Error('boom'));
    const r = await rateLimitBySession('account.update', 'user-1', OPTS);
    expect(r).toMatchObject({ allowed: false, firstRejection: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[rateLimit] abuse tier failed',
      expect.objectContaining({ scope: 'account.update', name: 'Error' }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ message: expect.anything() }),
    );
    consoleErrorSpy.mockRestore();
  });
});
