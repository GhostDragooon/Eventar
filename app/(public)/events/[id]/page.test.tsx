// D2 wiring (Ivan, 2026-10-01): the register card can only tell an organiser
// "this creates a guest registration" if the PAGE tells it the session is
// staff. RegisterCard.test.tsx proves the line renders given the prop, and
// actions.test.ts proves the write is a guest row for staff; this proves the
// page connects the two — and keeps its existing attendee/staff split intact
// (prefill + claim nudge for an attendee, neither for staff).
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { state } = vi.hoisted(() => ({
  state: {
    user: null as { id: string; email: string; email_confirmed_at: string | null } | null,
    isStaff: false,
  },
}));

const HOUR = 3_600_000;
const eventRow = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Workshop on Tuesdays',
  topic: null,
  start_time: new Date(Date.now() + 72 * HOUR).toISOString(),
  end_time: new Date(Date.now() + 75 * HOUR).toISOString(),
  timezone: 'Asia/Hong_Kong',
  venue_name: 'Office HQ',
  venue_address: null,
  city: null,
  region: null,
  country: null,
  description: null,
  status: 'published',
  max_attendees: null,
  registration_close_at: null,
  registration_open_at: null,
  hosted_by: null,
  organized_by: null,
  hero_image_url: null,
  organisation_id: null,
};

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: (..._args: unknown[]) => {
          if (table === 'agenda_blocks') {
            return { order: async () => ({ data: [], error: null }) };
          }
          if (table === 'users') {
            return {
              maybeSingle: async () => ({
                data: { full_name: 'Prac Person', preferred_name: null },
                error: null,
              }),
            };
          }
          return { maybeSingle: async () => ({ data: eventRow, error: null }) };
        },
      }),
    }),
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: async () => ({ count: 4, error: null }) }) }),
  })),
}));
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(),
  NotAuthorizedError: class NotAuthorizedError extends Error {},
  canManageEvent: vi.fn(() => false),
  isStaffSession: vi.fn(async () => state.isStaff),
}));
const { getUnlinkedRegistrationCount } = vi.hoisted(() => ({
  getUnlinkedRegistrationCount: vi.fn(async () => ({ ok: true as const, data: { count: 3 } })),
}));
vi.mock('@/app/account/actions', () => ({ getUnlinkedRegistrationCount }));
vi.mock('@/lib/accountCompleteness', () => ({
  isAccountComplete: vi.fn(async () => ({ complete: true })),
}));
vi.mock('@/lib/qr', () => ({ buildEventQrPng: vi.fn(async () => ({ pngBase64: 'UE5H' })) }));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://localhost:3000') }));
// The page returns an element tree that these tests inspect without rendering,
// so the components only need to exist as distinct, findable types.
vi.mock('@/components/RegisterCard', () => ({ default: function RegisterCard() { return null; } }));
vi.mock('@/components/shell/PublicShell', () => ({ PublicShell: function PublicShell() { return null; } }));
vi.mock('@/components/lifecycle/StatusPill', () => ({ StatusPill: function StatusPill() { return null; } }));

import { beforeEach, describe, expect, it } from 'vitest';
import RegisterCard from '@/components/RegisterCard';
import { PublicShell } from '@/components/shell/PublicShell';
import { isAccountComplete } from '@/lib/accountCompleteness';
import { BackToRegistrations } from './BackToRegistrations';
import PublicEventPage from './page';

type El = { type: unknown; props: Record<string, unknown> };

// Walks the un-rendered element tree the page returned.
function findElement(node: unknown, type: unknown): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El;
    if (el.type === type) return el;
    return findElement(el.props.children, type);
  }
  return null;
}

async function renderPage() {
  const tree = await PublicEventPage({ params: Promise.resolve({ id: eventRow.id }) });
  const card = findElement(tree, RegisterCard);
  const shell = findElement(tree, PublicShell);
  if (!card || !shell) throw new Error('RegisterCard / PublicShell not found in the page tree');
  return { card: card.props, shell: shell.props };
}

describe('/events/[id] page — what the register card is told about the session', () => {
  beforeEach(() => {
    state.user = null;
    state.isStaff = false;
    getUnlinkedRegistrationCount.mockClear();
  });

  it('staff session: isStaff reaches the card; no prefill, no sign-in nudge, no claim lookup', async () => {
    state.user = { id: 'staff-uid', email: 'org@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
    state.isStaff = true;

    const { card, shell } = await renderPage();

    expect(card.isStaff).toBe(true);
    expect(card.signedIn).toBe(true); // a session exists; the card branches on isStaff first
    expect(card.defaultEmail).toBeUndefined();
    expect(card.defaultName).toBeUndefined();
    expect(card.signInHref).toBeUndefined();
    expect(card.unlinkedRegistrationsCount).toBe(0);
    expect(getUnlinkedRegistrationCount).not.toHaveBeenCalled();
    expect(shell.isStaff).toBe(true);
  });

  it('attendee session: isStaff is false and the existing prefill + claim count are unchanged', async () => {
    state.user = { id: 'prac-uid', email: 'prac@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

    const { card, shell } = await renderPage();

    expect(card.isStaff).toBe(false);
    expect(card.signedIn).toBe(true);
    expect(card.defaultEmail).toBe('prac@example.com');
    expect(card.defaultName).toBe('Prac Person');
    expect(card.unlinkedRegistrationsCount).toBe(3);
    expect(shell.isStaff).toBe(false);
  });
});

// Ivan 2026-11-02 (7a-1): the public event page is the one portal exit that has no way back, so a signed-in, complete
// attendee gets a "Back to my registrations" strip. Only that exact triple: an incomplete account's portal links
// bounce to the wizard, and staff, signed-out visitors and guests see the page unchanged.
describe('/events/[id] page — the way back to the portal', () => {
  const strip = async () => findElement(await PublicEventPage({ params: Promise.resolve({ id: eventRow.id }) }), BackToRegistrations);

  beforeEach(() => {
    state.user = null;
    state.isStaff = false;
  });

  it('signed in + not staff + complete account: the strip is there', async () => {
    state.user = { id: 'prac-uid', email: 'prac@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
    expect(await strip()).not.toBeNull();
  });

  it('signed out: no strip', async () => {
    expect(await strip()).toBeNull();
  });

  it('staff session: no strip', async () => {
    state.user = { id: 'staff-uid', email: 'org@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
    state.isStaff = true;
    expect(await strip()).toBeNull();
  });

  it('incomplete account: no strip (its portal links would bounce to the wizard)', async () => {
    state.user = { id: 'prac-uid', email: 'prac@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
    vi.mocked(isAccountComplete).mockResolvedValueOnce({ complete: false } as Awaited<ReturnType<typeof isAccountComplete>>);
    expect(await strip()).toBeNull();
  });

  it('the completeness check throwing is treated as incomplete: no strip', async () => {
    state.user = { id: 'prac-uid', email: 'prac@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
    vi.mocked(isAccountComplete).mockRejectedValueOnce(new Error('db down'));
    expect(await strip()).toBeNull();
  });
});

