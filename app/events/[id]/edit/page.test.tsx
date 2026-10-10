import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

type Role = 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
let mockRole: Role = 'organiser_member';
// The role predicates and canManageEvent stay REAL: this file proves the page asks them
// and hands the answer to the Publish card, the wiring the component tests cannot see.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: vi.fn(async () => ({
    id: 'staff-1',
    email: 'organiser@example.com',
    role: mockRole,
    full_name: 'Org Aniser',
    organisation_id: 'org-1',
  })),
}));

const eventRow = {
  id: 'event-1',
  title: 'Clinical Skills Day',
  topic: null,
  start_time: '2026-10-05T01:00:00.000Z',
  end_time: '2026-10-05T04:00:00.000Z',
  timezone: 'Asia/Hong_Kong',
  venue_name: 'Queen Mary Hospital',
  venue_address: null,
  city: 'Hong Kong',
  region: null,
  country: 'China',
  latitude: 22.27,
  longitude: 114.13,
  description: null,
  status: 'draft',
  max_attendees: null,
  created_by: 'staff-1',
  organisation_id: 'org-1',
};

// A chainable stand-in for the query builder. Every method returns the chain; awaiting
// it resolves to an empty result; maybeSingle() on `events` returns the draft above.
function fakeClient() {
  const chain = (table: string): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null });
        if (prop === 'maybeSingle') return async () => ({ data: table === 'events' ? eventRow : null, error: null });
        return () => chain(table);
      },
      apply: () => chain(table),
    });
  return { from: (table: string) => chain(table) };
}
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => fakeClient() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => fakeClient() }));
vi.mock('@/lib/cpd/authorisedBodies', () => ({ listAuthorisedBodies: vi.fn(async () => ({ bodies: [], unavailable: false })) }));
vi.mock('./actions', () => ({ publishEvent: vi.fn(), getEventQrPng: vi.fn(), exportRegistrantsCsv: vi.fn() }));
vi.mock('./updateAction', () => ({ updateEvent: vi.fn() }));

import { describe, expect, it } from 'vitest';
import PublishDraftButton from './PublishDraftButton';
import { CpdAccreditationSection } from '@/components/details/CpdAccreditationSection';
import StaffEventEditPage from './page';

// The page is an async server component; calling it yields the element tree without
// rendering anything, so the Publish card's props can be read straight off it.
function findAll(node: ReactNode, type: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, found));
  else if (isValidElement(node)) {
    if (node.type === type) found.push(node);
    findAll((node.props as { children?: ReactNode }).children, type, found);
  }
  return found;
}

async function draftTree(role: Role) {
  mockRole = role;
  return StaffEventEditPage({ params: Promise.resolve({ id: 'event-1' }) });
}

// The card that wraps the Publish control: the nearest element carrying a `title` and a
// `body` whose subtree contains PublishDraftButton.
function publishCardOf(tree: ReactNode): { title: string; body: string } {
  const holders: ReactElement[] = [];
  (function walk(node: ReactNode) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isValidElement(node)) return;
    const props = node.props as { title?: unknown; body?: unknown; children?: ReactNode };
    if (typeof props.title === 'string' && typeof props.body === 'string' && findAll(props.children, PublishDraftButton).length > 0) {
      holders.push(node);
    }
    walk(props.children);
  })(tree);
  const card = holders.at(-1);
  expect(card, 'a card wraps the Publish control').toBeDefined();
  return card!.props as { title: string; body: string };
}

// P2a: body_admin and auditor were offered a Publish button on a draft and ended on a
// crash page. The card is told per role whether to show the button or the reason.
describe('draft edit page hands the Publish card what this role may do', () => {
  it.each([
    ['organiser_admin', true],
    ['organiser_member', true],
    ['eventar_staff', true],
    ['body_admin', false],
    ['auditor', false],
  ] as const)('%s: canPublish %s', async (role, canPublish) => {
    const cards = findAll(await draftTree(role), PublishDraftButton);
    expect(cards, 'exactly one Publish card on a draft').toHaveLength(1);
    expect(cards[0].props).toMatchObject({ eventId: 'event-1', canPublish });
  });
});

// The card sits OUTSIDE the form, so it publishes the SAVED version (said in its body);
// and a published event is read-only until P9b (said by PublishDraftButton, above the
// button). Both are said BEFORE the one-way step (user-lens 2026-10-02: an unsaved title
// fix went live with the old title, and the page that followed offered "ask an admin"
// even to an admin).
describe('the Publish card is honest before the one-way step', () => {
  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'] as const)('%s is told it publishes the last saved version', async (role) => {
    const card = publishCardOf(await draftTree(role));
    expect(card.title).toBe('Ready to publish?');
    expect(card.body).toMatch(/version you last saved/i);
    // The one-way warning itself lives in PublishDraftButton, at reading size.
    expect(card.body).not.toMatch(/cannot be edited after publishing/i);
  });

  it.each(['body_admin', 'auditor'] as const)('%s gets the reason in the heading, not a sales line above a missing button', async (role) => {
    const card = publishCardOf(await draftTree(role));
    expect(card.title).toBe('Publishing needs an organiser admin');
    expect(card.body).toBe("Your role can't publish events.");
    expect(`${card.title} ${card.body}`).not.toMatch(/QR|ready to publish/i);
  });

  it('uses no em-dash in the card copy (D14)', async () => {
    for (const role of ['organiser_admin', 'body_admin'] as const) {
      const card = publishCardOf(await draftTree(role));
      expect(`${card.title}${card.body}`).not.toContain('\u2014');
    }
  });
});

// set_event_cpd_config admits only organiser_admin and eventar_staff; the accreditation
// card used to offer every role a live Save that ended in a refusal blaming the owner.
describe('draft edit page hands the accreditation card what this role may do', () => {
  it.each([
    ['organiser_admin', true],
    ['organiser_member', false],
    ['eventar_staff', true],
    ['body_admin', false],
    ['auditor', false],
  ] as const)('%s: canSetAccreditation %s', async (role, canSet) => {
    const cards = findAll(await draftTree(role), CpdAccreditationSection);
    expect(cards, 'exactly one accreditation card').toHaveLength(1);
    expect(cards[0].props).toMatchObject({ canSetAccreditation: canSet });
  });
});
