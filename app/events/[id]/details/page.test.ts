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
// The details page reads through BOTH clients: the session client under RLS, and the
// service-role client for email_log / credit_ledger / participation_evidence and the
// organisation's authorised bodies. The fake serves the same tables to either.
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/tests/helpers/staffPageFakes');
  return { supabaseServer: async () => fakeSupabase(h.tables) };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeSupabase } = await import('@/tests/helpers/staffPageFakes');
  return { supabaseAdmin: () => fakeSupabase(h.tables) };
});

import { NOW, eventRow, settle, textOf } from '@/tests/helpers/staffPageFakes';
import EventDetailsPage from './page';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});
const open = (id: string) => settle(() => EventDetailsPage({ params: Promise.resolve({ id }) }));

// A published event of org B: readable by any session (events_public_read_published),
// and this page also renders admin-client values (credits issued, the organisation's
// authorised bodies) that belong to org B alone.
const eventB = eventRow({ id: 'ev-b', title: 'Org B event', organisation_id: 'org-b' });

describe('/events/[id]/details — Event Manager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.tables = { events: [eventB] };
  });
  afterEach(() => vi.useRealTimers());

  it("is a 404 for another organisation's staff", async () => {
    h.staff = staff('organiser_admin', 'org-a');
    expect(await open('ev-b')).toEqual({ kind: 'notFound' });
  });

  it('renders for the organisation that owns the event', async () => {
    h.staff = staff('organiser_admin', 'org-b');
    const out = await open('ev-b');
    expect(out.kind).toBe('render');
    if (out.kind !== 'render') return;
    expect(textOf(out.tree)).toContain('Org B event');
  });

  it('renders for eventar_staff on any organisation', async () => {
    h.staff = staff('eventar_staff', 'org-z');
    expect((await open('ev-b')).kind).toBe('render');
  });

  it('is a 404 for an event that does not exist', async () => {
    h.staff = staff('organiser_admin', 'org-a');
    expect(await open('no-such-event')).toEqual({ kind: 'notFound' });
  });
});
