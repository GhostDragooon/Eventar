/** @vitest-environment jsdom */
// History page: the guest-registration banner (Ivan 2026-11-02, pick 5a) beside the page's own read.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const s = vi.hoisted(() => ({
  count: undefined as unknown,
  attendance: undefined as unknown,
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'uma@sample.test', email_confirmed_at: '2026-10-24T00:00:00Z' } }, error: null }) },
  }),
}));
vi.mock('@/lib/accountCompleteness', () => ({ isAccountComplete: async () => ({ complete: true }) }));
vi.mock('../actions', () => ({
  listMyAttendanceRecords: async () => s.attendance,
  listMyCreditRecords: async () => ({ ok: true, data: { items: [] } }),
  getUnlinkedRegistrationCount: async () => {
    if (s.count instanceof Error) throw s.count;
    return s.count;
  },
}));
vi.mock('@/components/shell/AccountShell', () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));
vi.mock('./RecordClient', () => ({ RecordClient: () => <h1>History</h1> }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RecordPage from './page';

beforeEach(() => {
  s.count = { ok: true, data: { count: 0 } };
  s.attendance = { ok: true, data: { items: [] } };
});
afterEach(cleanup);

describe('History: guest-registration banner', () => {
  it('count 0: no banner', async () => {
    render(await RecordPage());
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
    expect(screen.queryByText(/made with your email as a guest/)).toBeNull();
  });

  it('count 1: singular, with the link to the claim page', async () => {
    s.count = { ok: true, data: { count: 1 } };
    render(await RecordPage());
    expect(screen.getByText(/We found 1 registration made with your email as a guest\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Link past registrations' })).toHaveAttribute('href', '/account/claim');
  });

  it('count N: plural', async () => {
    s.count = { ok: true, data: { count: 3 } };
    render(await RecordPage());
    expect(screen.getByText(/We found 3 registrations made with your email as a guest\./)).toBeTruthy();
  });

  it.each([
    ['ok: false', { ok: false, error: 'rate_limited', retryAfterMs: 1 }],
    ['a throw', new Error('db down')],
  ])('a failed count read (%s) shows no banner and the page still renders', async (_n, result) => {
    s.count = result;
    render(await RecordPage());
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
    expect(screen.queryByText(/made with your email as a guest/)).toBeNull();
  });
});
