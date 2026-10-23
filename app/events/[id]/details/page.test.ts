import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: async () => 'https://events.example.test' }));

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
import { PublishedNextSteps } from '@/components/details/PublishedNextSteps';

const staff = (role: string, organisation_id: string) => ({
  id: 'staff-1', email: 'staff@example.test', role, full_name: null, organisation_id,
});
const open = (id: string, searchParams: { published?: string } = {}) =>
  settle(() => EventDetailsPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }));

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

// UX-01 pick a1: Publish lands here with `?published=1`. Only an event that really is published may show it.
function findAll(node: unknown, type: unknown, found: { props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, found));
  else if (node && typeof node === 'object') {
    const el = node as { type?: unknown; props?: { children?: unknown } & Record<string, unknown> };
    if (el.type === type) found.push(el as { props: Record<string, unknown> });
    findAll(el.props?.children, type, found);
  }
  return found;
}

describe('/events/[id]/details: the Published next steps card', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.staff = staff('organiser_admin', 'org-b');
  });
  afterEach(() => vi.useRealTimers());

  async function cardsFor(row: ReturnType<typeof eventRow>, searchParams: { published?: string }) {
    h.tables = { events: [row] };
    const out = await open(row.id as string, searchParams);
    expect(out.kind).toBe('render');
    return out.kind === 'render' ? findAll(out.tree, PublishedNextSteps) : [];
  }

  const inHours = (h: number) => new Date(+NOW + h * 3_600_000).toISOString();

  it('shows after publishing, with the event id, the canonical origin and when check-in opens', async () => {
    const cards = await cardsFor(
      eventRow({ id: 'ev-p', organisation_id: 'org-b', status: 'published', start_time: inHours(3), end_time: inHours(6) }),
      { published: '1' },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].props).toMatchObject({ eventId: 'ev-p', origin: 'https://events.example.test' });
    expect(String(cards[0].props.checkinOpens)).toMatch(/^Check-in opens at .*60 minutes before the start\.$/);
  });

  it('says check-in is already open when the event has started', async () => {
    const cards = await cardsFor(eventRow({ id: 'ev-p', organisation_id: 'org-b', status: 'published' }), { published: '1' });
    expect(cards[0].props.checkinOpens).toBe('Check-in is open now.');
  });

  it('does not show on an ordinary visit', async () => {
    expect(await cardsFor(eventRow({ id: 'ev-p', organisation_id: 'org-b', status: 'published' }), {})).toHaveLength(0);
  });

  it('does not show for a draft even with the flag: it would say "live" about an event that is not', async () => {
    expect(await cardsFor(eventRow({ id: 'ev-d', organisation_id: 'org-b', status: 'draft' }), { published: '1' })).toHaveLength(0);
  });
});
