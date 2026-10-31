import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  staff: {} as Record<string, unknown>,
  tables: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: async () => h.staff,
}));
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/tests/helpers/staffPageFakes');
  return { supabaseServer: async () => fakeSupabase(h.tables) };
});

import { NOW, ended, eventRow, hrefsOf, textOf, treeOf } from '@/tests/helpers/staffPageFakes';
import AnalyticsIndexPage from './page';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});

// Both are published and past their end time, i.e. "completed" without the cron that
// would flip the row. events_public_read_published exposes both rows to any session.
const endedA = eventRow({ id: 'ev-a-ended', title: 'Org A ended', organisation_id: 'org-a', ...ended });
const endedB = eventRow({ id: 'ev-b-ended', title: 'Org B ended', organisation_id: 'org-b', ...ended });

describe('/analytics — History: what we ran (CX-04R)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.tables = { events: [endedA, endedB], registrations: [], survey_responses: [] };
  });
  afterEach(() => vi.useRealTimers());

  it("lists only the signed-in organiser's own organisation's completed events", async () => {
    h.staff = staff('organiser_admin', 'org-a');
    const hrefs = hrefsOf(await treeOf(() => AnalyticsIndexPage()));
    expect(hrefs).toContain('/events/ev-a-ended/analytics');
    expect(hrefs).not.toContain('/events/ev-b-ended/analytics');
  });

  it('lists every organisation for eventar_staff', async () => {
    h.staff = staff('eventar_staff', 'org-z');
    const hrefs = hrefsOf(await treeOf(() => AnalyticsIndexPage()));
    expect(hrefs).toContain('/events/ev-a-ended/analytics');
    expect(hrefs).toContain('/events/ev-b-ended/analytics');
  });

  it('is titled History and lists no upcoming event: the end-time cut is in the query, ahead of the limit', async () => {
    const future = eventRow({ id: 'ev-a-future', title: 'Org A next month', organisation_id: 'org-a', start_time: new Date(NOW + 86_400_000 * 30).toISOString(), end_time: new Date(NOW + 86_400_000 * 30 + 3_600_000).toISOString() });
    h.tables = { events: [endedA, future], registrations: [], survey_responses: [] };
    h.staff = staff('organiser_admin', 'org-a');
    const tree = await treeOf(() => AnalyticsIndexPage());
    expect(textOf(tree)).toContain('History');
    expect(hrefsOf(tree)).toContain('/events/ev-a-ended/analytics');
    expect(hrefsOf(tree)).not.toContain('/events/ev-a-future/analytics');
  });
});
