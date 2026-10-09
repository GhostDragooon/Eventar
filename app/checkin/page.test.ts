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

import { NOW, eventRow, hrefsOf, treeOf } from '@/tests/helpers/staffPageFakes';
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
