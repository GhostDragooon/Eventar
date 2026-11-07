import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

type Role = 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
let mockRole: Role = 'organiser_member';
let mockStaffId = 'staff-1';
// The role predicates and canManageEvent stay REAL: this file proves the page asks them
// and hands the answer to the Publish card, the wiring the component tests cannot see.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: vi.fn(async () => ({
    id: mockStaffId,
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
  registration_open_at: null,
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

import { afterEach, describe, expect, it } from 'vitest';
import PublishDraftButton from './PublishDraftButton';
import { DraftSavedBanner } from '@/components/event-form/DraftSavedBanner';
import { CpdAccreditationSection } from '@/components/details/CpdAccreditationSection';
import StaffEventEditPage from './page';
import { NOT_EVENT_WRITER, eventWriteRefusal } from '@/lib/lifecycle/eventLifecycle';

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

async function draftTree(role: Role, saved?: string) {
  mockRole = role;
  return StaffEventEditPage({ params: Promise.resolve({ id: 'event-1' }), searchParams: Promise.resolve(saved ? { saved } : {}) });
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

  it('uses no em-dash in the card copy (D14)', async () => {
    for (const role of ['organiser_admin', 'organiser_member'] as const) {
      const card = publishCardOf(await draftTree(role));
      expect(`${card.title}${card.body}`).not.toContain('\u2014');
    }
  });
});

// Q51 (Ivan, 2026-11-07): body_admin and auditor are read-only, and a member edits only its own events. They get the
// reason and no form, no Publish card, no accreditation card.
describe('draft edit page for an account that may not change this event', () => {
  afterEach(() => { mockStaffId = 'staff-1'; });
  it.each([['body_admin', 'staff-1'], ['auditor', 'staff-1'], ['organiser_member', 'staff-2']] as const)('%s (%s): the reason, read-only view, no live controls', async (role, id) => {
    mockStaffId = id;
    const tree = await draftTree(role);
    expect(findAll(tree, PublishDraftButton)).toHaveLength(0);
    // The read-only view still shows the accreditation, with no live Save (user-lens 2026-11-07: "View").
    const cpd = findAll(tree, CpdAccreditationSection);
    expect(cpd.every((c) => (c.props as { canSetAccreditation: boolean }).canSetAccreditation === false)).toBe(true);
    expect(textOf(tree)).toContain(eventWriteRefusal(role));
    // A body_admin who created an old draft itself is not told 'only the organiser who created this event'.
    if (role !== 'organiser_member') expect(textOf(tree)).not.toContain(NOT_EVENT_WRITER);
  });
});

// set_event_cpd_config admits only organiser_admin and eventar_staff; the accreditation
// card used to offer every role a live Save that ended in a refusal blaming the owner.
describe('draft edit page hands the accreditation card what this role may do', () => {
  it.each([
    ['organiser_admin', true],
    ['organiser_member', false],
    ['eventar_staff', true],
  ] as const)('%s: canSetAccreditation %s', async (role, canSet) => {
    const cards = findAll(await draftTree(role), CpdAccreditationSection);
    expect(cards, 'exactly one accreditation card').toHaveLength(1);
    expect(cards[0].props).toMatchObject({ canSetAccreditation: canSet });
  });
});

// UX-03: the confirm needs the event's own facts, and c1's banner needs to know the page was reached by Save draft.
describe('draft edit page feeds the confirm and the saved banner', () => {
  it('hands the Publish card the event title, start, timezone and registration open time', async () => {
    const [card] = findAll(await draftTree('organiser_admin'), PublishDraftButton);
    expect(card.props).toMatchObject({
      title: 'Clinical Skills Day',
      startIso: '2026-10-05T01:00:00.000Z',
      timezone: 'Asia/Hong_Kong',
      registrationOpenIso: null,
    });
  });

  it.each([
    [undefined, false],
    ['1', true],
    ['0', false],
  ] as const)('?saved=%s: savedOnLoad %s', async (saved, expected) => {
    const banners = findAll(await draftTree('organiser_admin', saved), DraftSavedBanner);
    expect(banners, 'one saved banner on a draft').toHaveLength(1);
    expect(banners[0].props).toMatchObject({ eventId: 'event-1', savedOnLoad: expected, canPublish: true });
  });

});

// RV-FINAL F60: a published event said "Need a change? Ask an admin" although no one can edit details or the agenda.
// The copy now says so and names only what exists: accreditation on this page, the registration close date on the
// Event Manager page, cancel and create on the Events page.
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}
function hrefsOf(node: ReactNode, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => hrefsOf(n, found));
  else if (isValidElement(node)) {
    const props = node.props as { href?: unknown; children?: ReactNode };
    if (typeof props.href === 'string') found.push(props.href);
    hrefsOf(props.children, found);
  }
  return found;
}

describe('a published or cancelled event says what is locked and what can still be done', () => {
  const original = eventRow.status;
  afterEach(() => {
    eventRow.status = original;
  });

  it('published: details locked, no "ask an admin", names the real next steps with working links', async () => {
    eventRow.status = 'published';
    const tree = await draftTree('organiser_admin');
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('Details are locked after publishing: nobody can change the title, date, venue or agenda yet.');
    expect(text).toContain('change the CPD accreditation above');
    expect(text).toContain('registration close date on the Event Manager page');
    expect(text).toContain('cancel it from the Events page');
    expect(text).not.toMatch(/ask an admin|isn.t available yet/i);
    expect(hrefsOf(tree)).toEqual(expect.arrayContaining(['/events/event-1/details', '/dashboard']));
  });

  // User-lens 2026-11-07: a member was told it could change the accreditation, next to "Your role can't set it".
  it('published, organiser_member creator: not told it can change the accreditation', async () => {
    eventRow.status = 'published';
    const text = textOf(await draftTree('organiser_member')).replace(/\s+/g, ' ');
    expect(text).toContain('Details are locked after publishing');
    expect(text).not.toContain('change the CPD accreditation above');
    expect(text).toContain('registration close date on the Event Manager page');
  });

  it('cancelled: does not offer to cancel again or to change registration', async () => {
    eventRow.status = 'cancelled';
    const text = textOf(await draftTree('organiser_admin')).replace(/\s+/g, ' ');
    expect(text).toContain('Details are locked after publishing');
    expect(text).toContain('create a new event from the Events page');
    expect(text).not.toMatch(/cancel it from|registration close date/i);
  });
});

// Two Save buttons on one screen: the accreditation card's own, and the form's at the bottom. Without the line the
// organiser cannot tell which one saves what (walk finding #27).
describe('draft edit page says what the accreditation Save covers', () => {
  function textOf(node: ReactNode): string {
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    if (typeof node === 'string') return node;
    return isValidElement(node) ? textOf((node.props as { children?: ReactNode }).children) : '';
  }
  const line = /Saves accreditation only\. Use Save changes at the bottom for the rest of the event\./;

  it.each(['organiser_admin', 'eventar_staff'] as const)('%s: the line sits with the accreditation card', async (role) => {
    expect(textOf(await draftTree(role))).toMatch(line);
  });

  it.each(['organiser_member', 'body_admin', 'auditor'] as const)('%s: no line, the card has no live Save for this role', async (role) => {
    expect(textOf(await draftTree(role))).not.toMatch(line);
  });
});
