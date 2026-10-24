// Door picker regression (found by the DB-04 round, 2026-10-24): /checkin read the first 100 published events by
// start ascending and dropped the past ones afterwards in JavaScript, so once an organisation had more than 100 past
// published events the picker showed "No open events" while events were live. Same bug as the public listing.
// The fake applies eq/is/gte/order/limit in the order PostgREST does (filter, sort, then cut).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({ state: { rows: [] as Row[] } }));

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: async () => ({ id: 'staff-1', email: 'staff@example.test', role: 'organiser_admin', full_name: null, organisation_id: 'org-a' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      const sorts: Array<{ col: string; ascending: boolean }> = [];
      let max = Infinity;
      const ms = (v: unknown) => Date.parse(v as string);
      const key = (r: Row, c: string) => (c.endsWith('_time') ? ms(r[c]) : (r[c] as string));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        gte: (c: string, v: string) => (filters.push((r) => ms(r[c]) >= ms(v)), q),
        in: (c: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[c])), q),
        order: (c: string, o?: { ascending: boolean }) => (sorts.push({ col: c, ascending: o?.ascending ?? true }), q),
        limit: (n: number) => ((max = n), q),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
          const out = (table === 'events' ? state.rows : []).filter((r) => filters.every((f) => f(r)));
          out.sort((a, b) => {
            for (const { col, ascending } of sorts) {
              const [x, y] = [key(a, col), key(b, col)];
              if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          return resolve({ data: out.slice(0, max), error: null });
        },
      };
      return q;
    },
  }),
}));

import { NOW, eventRow, hrefsOf, treeOf } from '@/tests/helpers/staffPageFakes';
import CheckinIndexPage from './page';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let seq = 0;
const ev = (over: { title: string; start: number; end: number } & Row): Row => {
  const { start, end, ...rest } = over;
  seq += 1;
  return eventRow({
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    organisation_id: 'org-a',
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    ...rest,
  });
};
const past = (i: number) => ev({ title: `Past ${i}`, start: NOW - (i + 3) * DAY, end: NOW - (i + 3) * DAY + 2 * HOUR });
const hrefsFor = async () => hrefsOf(await treeOf(() => CheckinIndexPage())).filter((h) => h.endsWith('/checkin'));

describe('/checkin — the door picker with a long history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    state.rows = [];
  });
  afterEach(() => vi.useRealTimers());

  it('lists the live and upcoming events when 120 past published events exist', async () => {
    const live = ev({ title: 'Live now', start: NOW - HOUR, end: NOW + 2 * HOUR });
    const soon = ev({ title: 'Tomorrow', start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    state.rows = [...Array.from({ length: 120 }, (_, i) => past(i)), live, soon];
    const hrefs = await hrefsFor();
    expect(hrefs).toContain(`/events/${live.id}/checkin`);
    expect(hrefs).toContain(`/events/${soon.id}/checkin`);
    expect(hrefs).toHaveLength(2);
  });

  it('events that ended a few days ago do not use up the 100 slots', async () => {
    const live = ev({ title: 'Live now', start: NOW - HOUR, end: NOW + 2 * HOUR });
    state.rows = [
      ...Array.from({ length: 110 }, (_, i) => ev({ title: `Recent ${i}`, start: NOW - 3 * DAY + i * 60_000, end: NOW - 2 * DAY })),
      live,
    ];
    expect(await hrefsFor()).toEqual([`/events/${live.id}/checkin`]);
  });

  it('events that start at the same moment are cut the same way every time (id tie-break)', async () => {
    const start = NOW + DAY;
    state.rows = Array.from({ length: 105 }, (_, i) => ev({ title: `Same ${i}`, start, end: start + HOUR })).reverse();
    const expected = [...state.rows].map((r) => `/events/${r.id}/checkin`).sort().slice(0, 100);
    const hrefs = await hrefsFor();
    expect(hrefs).toHaveLength(100);
    expect([...hrefs].sort()).toEqual(expected);
  });

  it('upcoming drafts do not use up the 100 slots', async () => {
    const live = ev({ title: 'Live now', start: NOW + 300 * DAY, end: NOW + 300 * DAY + HOUR });
    state.rows = [
      ...Array.from({ length: 105 }, (_, i) => ev({ title: `Draft ${i}`, status: 'draft', start: NOW + (i + 1) * DAY, end: NOW + (i + 1) * DAY + HOUR })),
      live,
    ];
    expect(await hrefsFor()).toEqual([`/events/${live.id}/checkin`]);
  });
});
