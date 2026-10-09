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

import { NOW, ended, eventRow, hrefsOf, treeOf } from '@/tests/helpers/staffPageFakes';
import AnalyticsIndexPage from './page';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});

// Both are published and past their end time, i.e. "completed" without the cron that
// would flip the row. events_public_read_published exposes both rows to any session.
const endedA = eventRow({ id: 'ev-a-ended', title: 'Org A ended', organisation_id: 'org-a', ...ended });
const endedB = eventRow({ id: 'ev-b-ended', title: 'Org B ended', organisation_id: 'org-b', ...ended });

describe('/analytics — pick a completed event to review', () => {
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
});
