// Public listing regression (DB-03 review F2): the page read the first 100 published events by start_time
// ascending, then dropped the past ones in JavaScript. Once more than 100 past events existed, the 100 rows were all
// past and no upcoming event was listed. The fake below applies eq/is/gte/order/limit in the order PostgREST does
// (filter, sort, then cut), so a limit placed ahead of the date filter shows up here the way it does against the DB.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({ state: { rows: [] as Row[] } }));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => {
      const filters: Array<(r: Row) => boolean> = [];
      const sorts: Array<{ col: string; ascending: boolean }> = [];
      let max = Infinity;
      const ms = (v: unknown) => Date.parse(v as string);
      const key = (r: Row, c: string) => (c.endsWith('_time') ? ms(r[c]) : (r[c] as string));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        is: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        gte: (c: string, v: string) => (filters.push((r) => ms(r[c]) >= ms(v)), q),
        order: (c: string, o?: { ascending: boolean }) => (sorts.push({ col: c, ascending: o?.ascending ?? true }), q),
        limit: (n: number) => ((max = n), q),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
          const out = state.rows.filter((r) => filters.every((f) => f(r)));
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
  })),
}));
vi.mock('@/app/account/actions', () => ({ getAccountMenuState: vi.fn() }));
vi.mock('@/components/shell/SiteShell', () => ({ SiteShell: () => null }));
vi.mock('./EventsListClient', () => ({ EventsListClient: () => null }));

import PublicEventsPage from './page';

const NOW = new Date('2026-10-24T05:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let seq = 0;

function event(over: { title: string; start: number; end: number } & Row): Row {
  const { start, end, ...rest } = over;
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    description: null,
    status: 'published',
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    timezone: 'Asia/Hong_Kong',
    venue_name: 'Hall',
    city: 'Hong Kong',
    category: 'medical',
    registration_close_at: null,
    registration_open_at: null,
    hosted_by: null,
    organized_by: null,
    deleted_at: null,
    ...rest,
  };
}

const past = (i: number) => event({ title: `Past ${i}`, start: NOW.getTime() - (i + 1) * DAY, end: NOW.getTime() - (i + 1) * DAY + 2 * HOUR });
const upcoming = (i: number) => event({ title: `Upcoming ${i}`, start: NOW.getTime() + (i + 1) * DAY, end: NOW.getTime() + (i + 1) * DAY + 2 * HOUR });

// The page returns an element tree without rendering it; the cards are the `events` prop of EventsListClient.
function cardTitles(node: unknown): string[] | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as { props?: { events?: Array<{ title: string }>; children?: unknown } };
  if (Array.isArray(el.props?.events)) return el.props.events.map((c) => c.title);
  for (const child of ([] as unknown[]).concat(el.props?.children ?? [])) {
    const found = cardTitles(child);
    if (found) return found;
  }
  return null;
}
const listed = async () => cardTitles(await PublicEventsPage()) ?? [];

describe('public events listing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    state.rows = [];
  });
  afterEach(() => vi.useRealTimers());

  it('lists the upcoming events when 120 past published events exist', async () => {
    state.rows = [...Array.from({ length: 120 }, (_, i) => past(i)), ...Array.from({ length: 3 }, (_, i) => upcoming(i))];
    expect(await listed()).toEqual(['Upcoming 0', 'Upcoming 1', 'Upcoming 2']);
  });

  it('keeps the soonest 100 in start order when more than 100 events are upcoming', async () => {
    state.rows = Array.from({ length: 105 }, (_, i) => upcoming(i)).reverse();
    const titles = await listed();
    expect(titles).toHaveLength(100);
    expect(titles[0]).toBe('Upcoming 0');
    expect(titles[99]).toBe('Upcoming 99');
  });

  it('lists an event that has started and not ended, and one ending exactly now, but not one that ended a millisecond ago', async () => {
    state.rows = [
      event({ title: 'Started, still running', start: NOW.getTime() - HOUR, end: NOW.getTime() + HOUR }),
      event({ title: 'Ends right now', start: NOW.getTime() - 2 * HOUR, end: NOW.getTime() }),
      event({ title: 'Ended 1ms ago', start: NOW.getTime() - 2 * HOUR, end: NOW.getTime() - 1 }),
      ...Array.from({ length: 120 }, (_, i) => past(i)),
    ];
    expect(await listed()).toEqual(['Ends right now', 'Started, still running']);
  });

  it('events that ended a few days ago do not use up the 100 slots either', async () => {
    // A lower bound looser than "now" (say 30 days back) lets 110 recent past events fill the cap.
    state.rows = [
      ...Array.from({ length: 110 }, (_, i) =>
        event({ title: `Recent ${i}`, start: NOW.getTime() - 3 * DAY + i * 60_000, end: NOW.getTime() - 2 * DAY })),
      ...Array.from({ length: 3 }, (_, i) => upcoming(i)),
    ];
    expect(await listed()).toEqual(['Upcoming 0', 'Upcoming 1', 'Upcoming 2']);
  });

  it('upcoming drafts do not use up the 100 slots (organisers can read drafts through RLS on this page)', async () => {
    state.rows = [
      ...Array.from({ length: 105 }, (_, i) => ({ ...upcoming(i), title: `Draft ${i}`, status: 'draft' })),
      ...Array.from({ length: 3 }, (_, i) => event({ title: `Published ${i}`, start: NOW.getTime() + (200 + i) * DAY, end: NOW.getTime() + (200 + i) * DAY + HOUR })),
    ];
    expect(await listed()).toEqual(['Published 0', 'Published 1', 'Published 2']);
  });

  it('events that start at the same moment are cut the same way every time (id tie-break)', async () => {
    const start = NOW.getTime() + DAY;
    state.rows = Array.from({ length: 105 }, (_, i) => event({ title: `Same ${String(i).padStart(3, '0')}`, start, end: start + HOUR }));
    state.rows.reverse();
    const idsByTitle = new Map(state.rows.map((r) => [r.title as string, r.id as string]));
    const kept = await listed();
    const expected = [...state.rows].sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1)).slice(0, 100).map((r) => r.title as string);
    expect(kept).toHaveLength(100);
    expect([...kept].sort()).toEqual([...expected].sort());
    expect(idsByTitle.size).toBe(105);
  });

  it('still hides drafts and soft-deleted events', async () => {
    state.rows = [
      upcoming(0),
      { ...upcoming(1), title: 'Draft', status: 'draft' },
      { ...upcoming(2), title: 'Deleted', deleted_at: NOW.toISOString() },
    ];
    expect(await listed()).toEqual(['Upcoming 0']);
  });
});
