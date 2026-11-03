import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Hoisted so the mock factories can read what each test sets.
const h = vi.hoisted(() => ({
  staff: {} as Record<string, unknown>,
  tables: {} as Record<string, Record<string, unknown>[]>,
}));

// canManageEvent and the rest of lib/auth stay REAL; only the session is faked.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: async () => h.staff,
}));
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/tests/helpers/staffPageFakes');
  return { supabaseServer: async () => fakeSupabase(h.tables) };
});

import { NOW, eventRow, hrefsOf, textOf, treeOf } from '@/tests/helpers/staffPageFakes';
import CheckinIndexPage from './page';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});

// events_public_read_published lets ANY signed-in session read every organisation's
// published events, so the database hands this page both rows below. The page itself
// must decide whose door the signed-in person is allowed to pick.
const liveA = eventRow({ id: 'ev-a-live', title: 'Org A live', organisation_id: 'org-a' });
const liveB = eventRow({ id: 'ev-b-live', title: 'Org B live', organisation_id: 'org-b' });

describe('/checkin — pick an event to run the door', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.tables = { events: [liveA, liveB], registrations: [] };
  });
  afterEach(() => vi.useRealTimers());

  it("lists only the signed-in organiser's own organisation's events", async () => {
    h.staff = staff('organiser_admin', 'org-a');
    const hrefs = hrefsOf(await treeOf(() => CheckinIndexPage()));
    expect(hrefs).toContain('/events/ev-a-live/checkin');
    expect(hrefs).not.toContain('/events/ev-b-live/checkin');
  });

  it('lists every organisation for eventar_staff', async () => {
    h.staff = staff('eventar_staff', 'org-z');
    const hrefs = hrefsOf(await treeOf(() => CheckinIndexPage()));
    expect(hrefs).toContain('/events/ev-a-live/checkin');
    expect(hrefs).toContain('/events/ev-b-live/checkin');
  });
});

// No-silence area 7b-1: the picker says what it is, when a desk opens, and why the list is empty.
describe('/checkin — copy', () => {
  const HOUR = 3_600_000;
  const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * HOUR).toISOString();
  const text = async () => textOf(await treeOf(() => CheckinIndexPage())).replace(/\s+/g, ' ');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.staff = staff('organiser_admin', 'org-a');
  });
  afterEach(() => vi.useRealTimers());

  it('names itself, says who it is for and when a desk opens', async () => {
    h.tables = { events: [liveA], registrations: [] };
    const t = await text();
    expect(t).toContain('Check-in: choose an event');
    expect(t).toContain('Open the desk for an event that is live now or coming up. A desk opens 60 minutes before the start.');
    expect(t).not.toContain('run the door');
  });

  it('keeps the live / coming-up count line, in step with the rows listed', async () => {
    // "later" has not opened registration yet (lifecycle upcoming); it still counts as coming up.
    h.tables = {
      events: [
        liveA,
        eventRow({ id: 'ev-a-soon', title: 'Soon', organisation_id: 'org-a', start_time: iso(24), end_time: iso(26) }),
        eventRow({ id: 'ev-a-later', title: 'Later', organisation_id: 'org-a', start_time: iso(72), end_time: iso(74), registration_open_at: iso(48) }),
      ],
      registrations: [],
    };
    const tree = await treeOf(() => CheckinIndexPage());
    expect(textOf(tree).replace(/\s+/g, ' ')).toContain('1 live now · 2 coming up');
    expect(hrefsOf(tree)).toHaveLength(3);
  });

  it('empty: says nothing is published and what to do, not "No open events"', async () => {
    h.tables = { events: [], registrations: [] };
    const t = await text();
    expect(t).toContain('No published events to check in. Publish an event and its check-in desk appears here.');
    expect(t).not.toContain('No open events');
    expect(t).toContain('Nothing live right now · 0 coming up');
  });
});
