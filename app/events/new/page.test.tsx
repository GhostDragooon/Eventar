import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

type Role = 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
let mockRole: Role = 'organiser_member';
// The role predicates stay REAL: this file tests that the page asks them and hands the
// answer to the form, which is the wiring the component tests cannot see.
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
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organisation_id: 'org-1' }, error: null }) }) }) }),
  }),
}));
vi.mock('@/lib/cpd/authorisedBodies', () => ({ listAuthorisedBodies: vi.fn(async () => ({ bodies: [], unavailable: false })) }));
vi.mock('./actions', () => ({ createEvent: vi.fn() }));
vi.mock('./NewEventForm', () => ({ default: function NewEventFormStub() { return null; } }));

import { describe, expect, it } from 'vitest';
import NewEventForm from './NewEventForm';
import NewEventPage from './page';

// The page is an async server component; calling it yields the element tree without
// rendering anything, so the form's props can be read straight off it.
function findAll(node: ReactNode, type: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, found));
  else if (isValidElement(node)) {
    if (node.type === type) found.push(node);
    findAll((node.props as { children?: ReactNode }).children, type, found);
  }
  return found;
}

async function formProps(role: Role) {
  mockRole = role;
  const tree = await NewEventPage();
  const [form] = findAll(tree, NewEventForm);
  expect(form, 'the page renders the create form').toBeDefined();
  return form.props as { canPublish: boolean; canSetAccreditation: boolean };
}

// P2a: a role that cannot publish, or cannot set accreditation, was offered both
// controls and then ended on a refusal (or a half-success). The component tests prove
// the form hides them when told to; this proves the page tells it, per role.
describe('create page hands the form what this role may do', () => {
  it.each([
    ['organiser_admin', true, true],
    ['organiser_member', true, false],
    ['eventar_staff', true, true],
    ['body_admin', false, false],
    ['auditor', false, false],
  ] as const)('%s: canPublish %s, canSetAccreditation %s', async (role, canPublish, canSetAccreditation) => {
    expect(await formProps(role)).toMatchObject({ canPublish, canSetAccreditation });
  });
});

// Every string the page renders itself (the form is stubbed, so its own copy is not in
// the tree).
function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

// User-lens 2026-10-02: the role sentence appeared in four wordings, two of them on the
// same screen. The reason is said once, next to the buttons (in the form); the lead says
// what a draft needs, which is what an organiser who cannot publish most needs to know.
describe('create page lead', () => {
  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'] as const)('%s: says what a draft needs and offers Publish', async (role) => {
    mockRole = role;
    const text = textOf(await NewEventPage());
    expect(text).toContain('A name, date, times and venue are enough to save a draft.');
    expect(text).toContain('or Publish event when it is ready to go live.');
  });

  it.each(['body_admin', 'auditor'] as const)('%s: says what a draft needs, never offers Publish, and does not repeat the role reason', async (role) => {
    mockRole = role;
    const text = textOf(await NewEventPage());
    expect(text).toContain('A name, date, times and venue are enough to save a draft.');
    expect(text).not.toMatch(/publish event/i);
    expect(text).not.toMatch(/your role can't publish/i);
  });

  it('uses no em-dash in the lead (D14)', async () => {
    for (const role of ['organiser_admin', 'body_admin'] as const) {
      mockRole = role;
      expect(textOf(await NewEventPage())).not.toContain('\u2014');
    }
  });
});
