// The loader Registrations and Check-in share: its guards (the incomplete-account redirect site among them), the
// page's own read, and the advisory guest-registration count that rides next to the items.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const s = vi.hoisted(() => ({
  user: { id: 'u1', email: 'uma@sample.test', email_confirmed_at: '2026-10-24T00:00:00Z' } as unknown,
  complete: true,
  licence: true,
  list: undefined as unknown,
  count: undefined as unknown,
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: s.user }, error: null }) } }),
}));
vi.mock('@/lib/accountCompleteness', () => ({
  isAccountComplete: async () => ({ complete: s.complete, licence: s.licence }),
}));
vi.mock('./actions', () => ({
  listMyAttendanceRecords: async () => s.list,
  getUnlinkedRegistrationCount: async () => {
    if (s.count instanceof Error) throw s.count;
    return s.count;
  },
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { loadMyRegistrations } from './loadMyRegistrations';

const items = [{ registration_id: 'r1' }];

beforeEach(() => {
  s.user = { id: 'u1', email: 'uma@sample.test', email_confirmed_at: '2026-10-24T00:00:00Z' };
  s.complete = true;
  s.licence = true;
  s.list = { ok: true, data: { items } };
  s.count = { ok: true, data: { count: 0 } };
});

describe('loadMyRegistrations', () => {
  it('signed out: sign-in with a way back', async () => {
    s.user = null;
    await expect(loadMyRegistrations('/account/registrations')).rejects.toThrow(
      'NEXT_REDIRECT:/account/sign-in?next=%2Faccount%2Fregistrations',
    );
  });

  it('incomplete account: the wizard, not the portal', async () => {
    s.complete = false;
    await expect(loadMyRegistrations('/account/registrations')).rejects.toThrow('NEXT_REDIRECT:/account/complete');
  });

  it('no licence declared: still the portal (not the wizard), flagged for the banner', async () => {
    s.licence = false;
    expect(await loadMyRegistrations('/account/registrations')).toMatchObject({ items, licenceMissing: true });
  });

  it('returns the items and the unlinked count side by side', async () => {
    s.count = { ok: true, data: { count: 3 } };
    expect(await loadMyRegistrations('/account/registrations')).toEqual({
      items,
      failed: false,
      unlinkedCount: 3,
      licenceMissing: false,
    });
  });

  it('a failed count read leaves the page intact and the count at 0 (no false banner)', async () => {
    s.count = { ok: false, error: 'rate_limited', retryAfterMs: 1 };
    expect(await loadMyRegistrations('/account/registrations')).toEqual({
      items,
      failed: false,
      unlinkedCount: 0,
      licenceMissing: false,
    });
  });

  it('a throwing count read does not break the page either', async () => {
    s.count = new Error('db down');
    expect(await loadMyRegistrations('/account/registrations')).toEqual({
      items,
      failed: false,
      unlinkedCount: 0,
      licenceMissing: false,
    });
  });

  it("the page's own read failure is NOT swallowed: failed stays true", async () => {
    s.list = { ok: false, error: 'internal_error' };
    s.count = { ok: true, data: { count: 2 } };
    expect(await loadMyRegistrations('/account/registrations')).toEqual({
      items: [],
      failed: true,
      unlinkedCount: 2,
      licenceMissing: false,
    });
  });

  it('a genuine auth failure on the read bounces to sign-in', async () => {
    s.list = { ok: false, error: 'not_authorized' };
    await expect(loadMyRegistrations('/account/check-in')).rejects.toThrow(
      'NEXT_REDIRECT:/account/sign-in?next=%2Faccount%2Fcheck-in',
    );
  });
});
