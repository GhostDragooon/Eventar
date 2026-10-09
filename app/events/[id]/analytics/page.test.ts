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

import { NOW, ended, eventRow, settle, textOf } from '@/tests/helpers/staffPageFakes';
import EventAnalyticsPage from './page';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});
const open = (id: string) => settle(() => EventAnalyticsPage({ params: Promise.resolve({ id }) }));

// Org B's event is published, so events_public_read_published lets any session read it.
// Its registrations and survey answers are RLS-scoped to org B and come back empty to
// anyone else — which is why an ungated page shows a confidently wrong "0 of 0".
const eventB = eventRow({ id: 'ev-b', title: 'Org B ended', organisation_id: 'org-b', ...ended });

describe('/events/[id]/analytics — post-event review', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.tables = {
      events: [eventB],
      registrations: [
        { event_id: 'ev-b', id: 'r1', status: 'attended', check_in_at: null },
        { event_id: 'ev-b', id: 'r2', status: 'registered', check_in_at: null },
      ],
      survey_responses: [],
      agenda_blocks: [],
    };
  });
  afterEach(() => vi.useRealTimers());

  it("is a 404 for another organisation's staff instead of a page of zeros", async () => {
    h.staff = staff('organiser_admin', 'org-a');
    expect(await open('ev-b')).toEqual({ kind: 'notFound' });
  });

  it('renders for the organisation that owns the event', async () => {
    h.staff = staff('organiser_admin', 'org-b');
    const out = await open('ev-b');
    expect(out.kind).toBe('render');
    if (out.kind !== 'render') return;
    const text = textOf(out.tree);
    expect(text).toContain('Org B ended');
    expect(text).toContain('1 of 2 registered attended');
  });

  it('renders for eventar_staff on any organisation', async () => {
    h.staff = staff('eventar_staff', 'org-z');
    expect((await open('ev-b')).kind).toBe('render');
  });

  it('is a 404 for an event that does not exist, before the ownership check can dereference it', async () => {
    h.staff = staff('organiser_admin', 'org-a');
    expect(await open('no-such-event')).toEqual({ kind: 'notFound' });
  });
});
