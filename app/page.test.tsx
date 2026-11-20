// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { afterEach } from 'vitest';

const getUser = vi.fn();
const getAccountMenuState = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({ auth: { getUser } }) }));
vi.mock('@/app/account/actions', () => ({ getAccountMenuState: (...a: unknown[]) => getAccountMenuState(...a) }));
vi.mock('@/components/landing/LandingAuthPill', () => ({ LandingAuthPill: () => null }));

import LandingPage from './page';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('landing page session read', () => {
  it('auth error degrades to the signed-out nav, not a throw', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } });
    render(await LandingPage());
    const nav = within(screen.getByRole('navigation', { name: /primary/i }));
    expect(nav.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/account/sign-in');
    expect(getAccountMenuState).not.toHaveBeenCalled();
  });

  it('signed in but menu state throws: page still renders with the Account menu', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    getAccountMenuState.mockRejectedValue(new Error('db down'));
    render(await LandingPage());
    expect(within(screen.getByRole('navigation', { name: /primary/i })).getByRole('button', { name: /^account$/i })).toBeInTheDocument();
  });
});
