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

import { fetchDecoratedEvents } from './data';

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
