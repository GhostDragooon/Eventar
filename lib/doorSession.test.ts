import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getUser, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { getSession, getUser, signOut } }) }));

import { checkDoorSession } from './doorSession';

// The door at check-in turns 'ended' and 'signed_out' into "You've been signed
// out" and everything else into a retryable error, so 'unknown' (a network
// failure) must never be reported as a sign-out (Ivan, 2026-10-15).
describe('checkDoorSession', () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
  });

  it('no cookie session: signed_out, no network call', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await checkDoorSession()).toBe('signed_out');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('server confirms the session: signed_in', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    expect(await checkDoorSession()).toBe('signed_in');
  });

  it('server rejects it (4xx): ended, and the dead cookie is cleared', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 403 } });
    expect(await checkDoorSession()).toBe('ended');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('network failure: unknown, never a sign-out, cookie kept', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 0 } });
    expect(await checkDoorSession()).toBe('unknown');
    expect(signOut).not.toHaveBeenCalled();
  });
});
