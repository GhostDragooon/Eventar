// Regression test for the cross-org leak found 2026-09-17: events_public_read_
// published (RLS) legitimately lets any authenticated caller read any
// PUBLISHED event (public discovery pages need that), so a query with no
// explicit organisation_id filter mixed OTHER orgs' published events into an
// organiser's own Programme/Manage dashboard. This file tests one thing —
// that the query is scoped to the caller's own org unless they're
// eventar_staff (same exception as canManageEvent in lib/auth.ts).
import { vi, describe, it, expect } from 'vitest';

vi.mock('server-only', () => ({}));

function makeQueryMock(rows: unknown[], regs: unknown[] = []) {
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
    in: async () => ({ data: regs, error: null }),
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

// Found 2026-10-24 (CX-04 live walk): the registrations lookup sent every event id in one `.in()`. 242 ids made a
// 9 KB URL, the gateway answered 414 and /dashboard and /dashboard/manage crashed for any organisation past about
// 220 events (the query is capped at 300 events, so it can never get better by itself).
describe('fetchDecoratedEvents — the registrations lookup stays under the URL limit', () => {
  const event = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Event ${i}`, description: null, start_time: '2026-11-01T02:00:00Z', end_time: '2026-11-01T04:00:00Z',
    timezone: 'Asia/Hong_Kong', status: 'published', venue_name: null, max_attendees: null,
    registration_close_at: null, registration_open_at: null, created_by: null, category: null,
    deleted_at: null, format: null, hero_image_url: null, city: null, organized_by: null,
  });

  it('asks for registrations in small batches and still counts every event', async () => {
    const events = Array.from({ length: 250 }, (_, i) => event(i));
    const idLists: string[][] = [];
    const eventsBuilder = makeQueryMock(events).builder;
    const regsBuilder = {
      select: () => regsBuilder,
      in: async (_col: string, ids: string[]) => {
        idLists.push(ids);
        return {
          data: ids
            .filter((id) => id === events[0].id || id === events[249].id)
            .map((id) => ({ event_id: id, status: 'registered', registered_at: null, check_in_at: null })),
          error: null,
        };
      },
    };
    const supabase = { from: (t: string) => (t === 'events' ? eventsBuilder : regsBuilder) } as never;

    const { events: out } = await fetchDecoratedEvents(supabase, Date.now(), { role: 'organiser_admin', organisation_id: 'org-mine' });

    expect(idLists.length).toBeGreaterThan(1);
    // 37 characters per id in the URL: 100 ids is about 3.7 KB, well under the 8 KB gateway limit.
    expect(Math.max(...idLists.map((l) => l.length))).toBeLessThanOrEqual(100);
    expect(idLists.flat().sort()).toEqual(events.map((e) => e.id).sort());
    expect(out[0].registered).toBe(1);
    expect(out[249].registered).toBe(1);
    expect(out[100].registered).toBe(0);
  });

  it('a failing batch fails the page (rule 12), even when it is not the first batch', async () => {
    const eventsBuilder = makeQueryMock(Array.from({ length: 250 }, (_, i) => event(i))).builder;
    let call = 0;
    const regsBuilder = {
      select: () => regsBuilder,
      in: async () => (++call === 2 ? { data: null, error: new Error('boom') } : { data: [], error: null }),
    };
    const supabase = { from: (t: string) => (t === 'events' ? eventsBuilder : regsBuilder) } as never;
    await expect(
      fetchDecoratedEvents(supabase, Date.now(), { role: 'organiser_admin', organisation_id: 'org-mine' }),
    ).rejects.toThrow('boom');
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

// Each event is stamped with its own local date (dayKey), not the organiser's or the server's.
describe('fetchDecoratedEvents: dayKey', () => {
  const event = {
    id: 'ev1', title: 't', description: null,
    start_time: '2026-10-20T02:00:00Z', end_time: '2026-10-20T04:00:00Z', timezone: 'America/New_York',
    status: 'published', venue_name: null, max_attendees: null, registration_close_at: null,
    registration_open_at: null, created_by: null, category: null, deleted_at: null, format: null,
    hero_image_url: null, city: null, organized_by: [],
  };

  it("stamps each event with its own local date", async () => {
    // 2026-10-20T02:00Z is Mon 19 Oct 22:00 in New York.
    const { builder } = makeQueryMock([event]);
    const { events } = await fetchDecoratedEvents({ from: () => builder } as never, Date.parse('2026-10-15T02:00:00Z'), {
      role: 'organiser_admin',
      organisation_id: 'org-mine',
    });
    expect(events[0].dayKey).toBe('2026-10-19');
  });
});
