import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it, beforeEach } from 'vitest';

// Mocks for recordAbuseHitAndMaybeRevoke's collaborators. Each is a vi.fn()
// so individual tests can set its resolved/return value per-case.
const { mockRateLimitBySession, mockSignOut, mockRpc } = vi.hoisted(() => ({
  mockRateLimitBySession: vi.fn(),
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('./rateLimit', () => ({
  rateLimitBySession: mockRateLimitBySession,
}));
vi.mock('./supabase/admin', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { signOut: mockSignOut } },
    rpc: mockRpc,
  }),
}));

import { recordAbuseHitAndMaybeRevoke } from './abuseTier';

const ARGS = { sessionAccessToken: 'tok-1', userId: 'user-1' };

describe('recordAbuseHitAndMaybeRevoke', () => {
  beforeEach(() => {
    mockRateLimitBySession.mockReset();
    mockSignOut.mockReset();
    mockRpc.mockReset();
  });

  it('1st hit (allowed) does not revoke or touch signOut/RPC', async () => {
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: true, remaining: 2, resetAt: new Date() });

    const result = await recordAbuseHitAndMaybeRevoke(ARGS);

    expect(result).toEqual({ revoked: false });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('2nd hit (allowed) does not revoke or touch signOut/RPC', async () => {
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: new Date() });

    const result = await recordAbuseHitAndMaybeRevoke(ARGS);

    expect(result).toEqual({ revoked: false });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('3rd hit (disallowed) revokes: signOut + audit RPC called with the right args', async () => {
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 'audit-id-1', error: null });

    const result = await recordAbuseHitAndMaybeRevoke(ARGS);

    expect(result).toEqual({ revoked: true });
    expect(mockSignOut).toHaveBeenCalledWith(ARGS.sessionAccessToken, 'global');
    expect(mockRpc).toHaveBeenCalledWith('record_session_revocation', {
      p_user_id: ARGS.userId,
      p_reason: '3_session_rate_limit_hits_60min',
      p_scope: 'global',
    });
  });

  it('signOut error does not bail early — audit RPC is still attempted, still revoked:true', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: { code: 'signout_failed', message: 'boom' } });
    mockRpc.mockResolvedValueOnce({ data: 'audit-id-2', error: null });

    const result = await recordAbuseHitAndMaybeRevoke(ARGS);

    expect(mockRpc).toHaveBeenCalledWith('record_session_revocation', {
      p_user_id: ARGS.userId,
      p_reason: '3_session_rate_limit_hits_60min',
      p_scope: 'global',
    });
    expect(result).toEqual({ revoked: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[abuseTier] signOut failed',
      expect.objectContaining({ code: 'signout_failed' }),
    );
    consoleErrorSpy.mockRestore();
  });

  it('audit RPC error is logged (fail visibly) but still returns revoked:true, does not throw', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'rpc_failed', message: 'boom' } });

    let result;
    await expect(
      (async () => {
        result = await recordAbuseHitAndMaybeRevoke(ARGS);
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
