import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it, beforeEach } from 'vitest';

// Mocks for recordAbuseHitAndMaybeRevoke's collaborators. Each is a vi.fn()
// so individual tests can set its resolved/return value per-case.
const { mockRateLimitByUser, mockSignOut, mockRpc, mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockRateLimitByUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('./rateLimit', () => ({
  rateLimitByUser: mockRateLimitByUser,
}));
// The subject comes from the caller's own session (not the limiter key).
vi.mock('./supabase/server', () => ({
  supabaseServer: async () => ({ auth: { getUser: mockGetUser, getSession: mockGetSession } }),
}));
vi.mock('./supabase/admin', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { signOut: mockSignOut } },
    rpc: mockRpc,
  }),
}));

import { recordAbuseHitAndMaybeRevoke } from './abuseTier';

const USER_ID = 'user-1';
const TOKEN = 'tok-1';

describe('recordAbuseHitAndMaybeRevoke', () => {
  beforeEach(() => {
    mockRateLimitByUser.mockReset();
    mockSignOut.mockReset();
    mockRpc.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
  });

  it('no authenticated session: records nothing, revokes nothing, logs (fail visibly)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await recordAbuseHitAndMaybeRevoke();

    expect(result).toEqual({ revoked: false });
    expect(mockRateLimitByUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[abuseTier] no authenticated session; abuse hit not recorded', expect.any(Object),
    );
    consoleErrorSpy.mockRestore();
  });

  it('1st hit (allowed) does not revoke or touch signOut/RPC', async () => {
    mockRateLimitByUser.mockResolvedValueOnce({ allowed: true, remaining: 2, resetAt: new Date() });

    const result = await recordAbuseHitAndMaybeRevoke();

    expect(result).toEqual({ revoked: false });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('2nd hit (allowed) does not revoke or touch signOut/RPC', async () => {
    mockRateLimitByUser.mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: new Date() });

    const result = await recordAbuseHitAndMaybeRevoke();

    expect(result).toEqual({ revoked: false });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('3rd hit (disallowed) revokes: signOut + audit RPC called with the right args', async () => {
    mockRateLimitByUser.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 'audit-id-1', error: null });

    const result = await recordAbuseHitAndMaybeRevoke();

    expect(result).toEqual({ revoked: true });
    // Security review 2026-08-06: keyed on userId (UUID), never the access
    // token — the key is persisted to rate_limits.key and logged.
    // max 2: rate_limit_check allows while count <= max, so the 3rd hit is
    // the first disallowed one — 3 hits revoke (Decisions Log Item 11).
    expect(mockRateLimitByUser).toHaveBeenCalledWith('sessionAbuse', USER_ID, {
      windowMs: 60 * 60 * 1000,
      max: 2,
    });
    // The verified subject is the exact token being revoked.
    expect(mockGetUser).toHaveBeenCalledWith(TOKEN);
    // The raw token is still used for the global signOut (a bearer op, not a key).
    expect(mockSignOut).toHaveBeenCalledWith(TOKEN, 'global');
    expect(mockRpc).toHaveBeenCalledWith('record_session_revocation', {
      p_user_id: USER_ID,
      p_reason: '3_session_rate_limit_hits_60min',
      p_scope: 'global',
    });
  });

  it('signOut error: no revoke happened, so no audit row and revoked:false (Rule 12, Hard Rule 11)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRateLimitByUser.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: { code: 'signout_failed', message: 'boom' } });

    const result = await recordAbuseHitAndMaybeRevoke();

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toEqual({ revoked: false });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[abuseTier] signOut failed; no revoke, no audit row',
      expect.objectContaining({ code: 'signout_failed' }),
    );
    consoleErrorSpy.mockRestore();
  });

  it('audit RPC error is logged (fail visibly) but still returns revoked:true, does not throw', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRateLimitByUser.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'rpc_failed', message: 'boom' } });

    let result;
    await expect(
      (async () => {
        result = await recordAbuseHitAndMaybeRevoke();
      })(),
    ).resolves.not.toThrow();

    expect(result).toEqual({ revoked: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[abuseTier] audit write failed',
      expect.objectContaining({ code: 'rpc_failed' }),
    );
    consoleErrorSpy.mockRestore();
  });
});
