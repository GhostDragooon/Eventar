// UX-02 card done-when: each portal page renders inside AccountShell (the doors, sign-in and sign-up, do not: they keep
// SiteShell; see app/account/sign-up/page.test.tsx). The pages return an element tree, so the root element's type is the shell.
import { vi } from 'vitest';
vi.mock('server-only', () => ({})); // the History page reads the claim-banner count (readUnlinkedCount.ts)

const { s, ok, chain } = vi.hoisted(() => {
  // Any chain of query-builder calls, awaited, yields an empty successful result.
  const chain = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, k) => (k === 'then' ? (res: (v: unknown) => unknown) => res({ data: [], error: null }) : chain()),
      apply: () => chain(),
    });
  return { s: { complete: true }, ok: (data: unknown) => async () => ({ ok: true, data }), chain };
});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'uma@sample.test', email_confirmed_at: '2026-10-24T00:00:00Z' } }, error: null }) },
    from: () => chain(),
  }),
}));
vi.mock('@/lib/accountCompleteness', () => ({
  isAccountComplete: async () => ({ complete: s.complete, consents: true, identity: true, profile: true }),
}));
vi.mock('./actions', () => ({
  getMyAccountAndProfile: ok({ account: { id: 'u1' }, profile: null }),
  getUnlinkedRegistrationCount: ok({ count: 0 }),
  listMyLicences: ok({ licences: [] }),
  listMyAppointments: ok({ appointments: [] }),
  listMySocietyMemberships: ok({ memberships: [] }),
  listMyAttendanceRecords: ok({ items: [] }),
  listMyCreditRecords: ok({ items: [] }),
}));
vi.mock('@/components/shell/AccountShell', () => ({ AccountShell: () => null }));
vi.mock('@/components/shell/SiteShell', () => ({ SiteShell: () => null }));
vi.mock('./AccountClient', () => ({ AccountClient: () => null }));
vi.mock('./record/RecordClient', () => ({ RecordClient: () => null }));
vi.mock('./loadMyRegistrations', () => ({
  loadMyRegistrations: async () => {
    if (!s.complete) throw new Error('NEXT_REDIRECT:/account/complete');
    return { items: [], failed: false };
  },
}));
vi.mock('./profile/ProfileClient', () => ({ ProfileClient: () => null }));
vi.mock('./claim/ClaimClient', () => ({ ClaimClient: () => null }));

import { beforeEach, describe, expect, it } from 'vitest';
import { AccountShell } from '@/components/shell/AccountShell';
import AccountPage from './page';
import RecordPage from './record/page';
import RegistrationsPage from './registrations/page';
import CheckinPage from './check-in/page';
import ProfilePage from './profile/page';
import ClaimPage from './claim/page';

beforeEach(() => {
  s.complete = true;
});

const pages: [string, () => Promise<unknown>][] = [
  ['/account', AccountPage],
  ['/account/record', RecordPage],
  ['/account/registrations', RegistrationsPage],
  ['/account/check-in', CheckinPage],
  ['/account/profile', ProfilePage],
  ['/account/claim', ClaimPage],
];

describe('portal pages render inside AccountShell', () => {
  it.each(pages)('%s', async (_path, page) => {
    expect((await page() as { type: unknown }).type).toBe(AccountShell);
  });

  it.each(pages)('%s sends an incomplete account to /account/complete, not into the portal', async (_path, page) => {
    s.complete = false;
    await expect(page()).rejects.toThrow('NEXT_REDIRECT:/account/complete');
  });
});
