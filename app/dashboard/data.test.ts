// Regression test for the cross-org leak found 2026-09-17: events_public_read_
// published (RLS) legitimately lets any authenticated caller read any
// PUBLISHED event (public discovery pages need that), so a query with no
// explicit organisation_id filter mixed OTHER orgs' published events into an
// organiser's own Programme/Manage dashboard. This file tests one thing —
// that the query is scoped to the caller's own org unless they're
// eventar_staff (same exception as canManageEvent in lib/auth.ts).
import { vi, describe, it, expect } from 'vitest';

vi.mock('server-only', () => ({}));

function makeQueryMock(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder = {
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: 'order', args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: 'limit', args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return builder;
    },
    in: async () => ({ data: [], error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return { builder, calls };
}

import { fakeSupabase } from '@/tests/helpers/staffPageFakes';
import { fetchDecoratedEvents, ownEvents } from './data';

describe('fetchDecoratedEvents — org scoping (regression, 2026-09-17 cross-org leak)', () => {
  it('filters by organisation_id for a non-eventar_staff caller', async () => {
    const { builder, calls } = makeQueryMock([]);
    const supabase = { from: () => builder } as never;

    await fetchDecoratedEvents(supabase, Date.now(), {
      role: 'organiser_admin',
      organisation_id: 'org-mine',
    });

    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'organisation_id' && c.args[1] === 'org-mine')).toBe(
      true,
    );
  });

  it('does NOT filter by organisation_id for eventar_staff (sees every org, matching canManageEvent)', async () => {
    const { builder, calls } = makeQueryMock([]);
    const supabase = { from: () => builder } as never;

    await fetchDecoratedEvents(supabase, Date.now(), {
      role: 'eventar_staff',
      organisation_id: null,
    });

    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'organisation_id')).toBe(false);
  });
});

// ownEvents is the one place the scope rule lives; /checkin, /analytics and the
// dashboards all list through it. fakeSupabase APPLIES the eq filter, so this asserts
// which rows come back, not which methods were called.
describe('ownEvents — the scope rule every staff event list goes through', () => {
  const tables = {
    events: [
      { id: 'ev-a', organisation_id: 'org-a' },
      { id: 'ev-b', organisation_id: 'org-b' },
    ],
  };

  it("returns only the caller's own organisation's events for a non-eventar_staff role", async () => {
    for (const role of ['organiser_admin', 'organiser_member', 'body_admin', 'auditor'] as const) {
      const { data, error } = await ownEvents(fakeSupabase(tables) as never, { role, organisation_id: 'org-a' }, 'id');
      expect(error, role).toBeNull();
      expect(data, role).toEqual([{ id: 'ev-a' }]);
    }
  });

  it('returns every organisation for eventar_staff', async () => {
    const { data, error } = await ownEvents(
      fakeSupabase(tables) as never,
      { role: 'eventar_staff', organisation_id: 'org-a' },
      'id',
    );
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'ev-a' }, { id: 'ev-b' }]);
  });
});
