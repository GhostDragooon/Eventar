/** @vitest-environment jsdom */
// Acceptance walk: a member was offered "Manage team" and landed on a page with no invite control.
import { vi } from 'vitest';

const h = vi.hoisted(() => ({ role: 'organiser_member' as string }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireStaff: async () => ({ id: 'u1', email: 'a@b.co', role: h.role, organisation_id: null }),
}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/components/shell/StaffShell', () => ({ StaffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./SettingsClient', () => ({ default: () => null, SettingsSignOut: () => null }));
vi.mock('./OrgOnboardingClient', () => ({ OrgOnboardingClient: () => null }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SettingsPage from './page';

afterEach(cleanup);

const open = async (role: string) => {
  h.role = role;
  render(await SettingsPage());
};

describe('/settings Team card', () => {
  it.each(['organiser_admin', 'eventar_staff'])('%s is offered Manage team', async (role) => {
    await open(role);
    expect(screen.getByRole('link', { name: /Manage team/ })).toHaveAttribute('href', '/settings/team');
  });

  it.each(['organiser_member', 'body_admin', 'auditor'])('%s is told who can invite instead of being sent to a page without the control', async (role) => {
    await open(role);
    expect(screen.queryByRole('link', { name: /Manage team/ })).toBeNull();
    expect(screen.getByText('Only organiser admins can invite teammates. Ask an admin of your organisation.')).toBeInTheDocument();
  });
});
