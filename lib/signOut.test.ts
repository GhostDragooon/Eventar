/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }));

import { SIGN_OUT_FAILED, signOutAndLeave } from './signOut';

let loc: { href: string };
beforeEach(() => {
  loc = { href: '/account' };
  vi.stubGlobal('location', loc);
  signOut.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('signOutAndLeave', () => {
  it('server revoke succeeded: hard-navigates to the destination and returns no error', async () => {
    signOut.mockResolvedValue({ error: null });
    expect(await signOutAndLeave('/login')).toBeNull();
    expect(loc.href).toBe('/login');
  });

  it('server revoke returned an error: does NOT navigate, returns the message', async () => {
    signOut.mockResolvedValue({ error: { message: 'boom' } });
    expect(await signOutAndLeave('/')).toBe(SIGN_OUT_FAILED);
    expect(loc.href).toBe('/account');
  });

  it('signOut throwing (offline) is a failure too, not a silent sign-out', async () => {
    signOut.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await signOutAndLeave('/')).toBe(SIGN_OUT_FAILED);
    expect(loc.href).toBe('/account');
  });
});
