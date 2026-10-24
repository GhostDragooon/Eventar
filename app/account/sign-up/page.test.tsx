/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Same mocking shape as app/account/sign-in/page.test.tsx — this page is a
// clone of that one with sign-up framed copy, same session short-circuit,
// same shared Server Action.
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
  }),
}));
let mockSearchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
// sign-up/page.tsx imports sendAttendeeMagicLink from '../sign-in/actions'.
vi.mock('../sign-in/actions', () => ({
  sendAttendeeMagicLink: vi.fn(async () => ({ ok: true as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AttendeeSignUpPage from './page';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';

afterEach(() => {
  cleanup();
  mockSearchParams = new URLSearchParams('');
});

// SiteShell's own nav also renders a "Sign in" link (the signed-out CTA), so
// once the form mounts there are two links named "Sign in" on the page —
// the nav pill and the in-page "Already have an account?" link. Rather than
// pick one element out ambiguously, wait for both to exist (2 links) and
// assert against the full set of hrefs.
async function signInLinkHrefs(): Promise<(string | null)[]> {
  await waitFor(() => expect(screen.getAllByRole('link', { name: /sign in/i })).toHaveLength(2));
  return screen.getAllByRole('link', { name: /sign in/i }).map((l) => l.getAttribute('href'));
}

describe('AttendeeSignUpPage', () => {
  it('renders sign-up-framed copy, not sign-in copy', async () => {
    render(<AttendeeSignUpPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /create your eventar record/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/send you a one-time link/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in to your account/i)).not.toBeInTheDocument();
  });

  it('submit button reads "Send sign-up link"', async () => {
    render(<AttendeeSignUpPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /send sign-up link/i })).toBeInTheDocument());
  });

  it('renders a quiet "Already have an account? Sign in" link to /account/sign-in', async () => {
    render(<AttendeeSignUpPage />);
    const hrefs = await signInLinkHrefs();
    expect(hrefs).toContain('/account/sign-in');
  });

  it('forwards ?next= onto the Sign in link', async () => {
    // A real event path: events.id is a uuid, and only attendee paths are forwarded (FR-005).
    mockSearchParams = new URLSearchParams(`next=/events/${EVENT}`);
    render(<AttendeeSignUpPage />);
    const hrefs = await signInLinkHrefs();
    // The nav's own Sign-in pill never carries ?next= (it doesn't know about
    // this page's next param); the in-page link does.
    expect(hrefs).toContain('/account/sign-in');
    expect(hrefs).toContain(`/account/sign-in?next=${encodeURIComponent(`/events/${EVENT}`)}`);
  });
});

// Spec 001 FR-005 / User Story 2: the destination survives sign-up AND the
// first-run wizard. The emailed link lands on /account/complete?next=<dest>:
// an incomplete account runs the wizard and is handed on to <dest> at the end,
// a returning account is passed straight through to it. No destination: the
// default flow, untouched (the portal home).
describe('AttendeeSignUpPage — next', () => {
  async function render_(search: URLSearchParams) {
    mockSearchParams = search;
    const { container } = render(<AttendeeSignUpPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /send sign-up link/i })).toBeInTheDocument());
    return container;
  }
  const formNext = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[name="next"]')?.value ?? null;

  it('routes the emailed link through the wizard, carrying the destination', async () => {
    const c = await render_(new URLSearchParams({ next: '/account/claim' }));
    expect(formNext(c)).toBe(`/account/complete?next=${encodeURIComponent('/account/claim')}`);
  });

  // CX-06a user lens U-01: "Create your Eventar record" from the guest success card opens an empty form; the
  // claim only works if the visitor uses the address they registered with, so say so, only on that path.
  it('tells a visitor coming from the registration card to use the same email, and only then', async () => {
    const claim = await render_(new URLSearchParams({ next: '/account/claim' }));
    expect(claim.textContent).toMatch(/Use the same email you just registered with/);
    cleanup();
    const plain = await render_(new URLSearchParams({}));
    expect(plain.textContent).not.toMatch(/same email you just registered with/);
    cleanup();
    const other = await render_(new URLSearchParams({ next: `/events/${EVENT}` }));
    expect(other.textContent).not.toMatch(/same email you just registered with/);
  });

  it('carries a query-bearing destination whole (encoded once)', async () => {
    const c = await render_(new URLSearchParams({ next: `/events/${EVENT}?ref=card` }));
    expect(formNext(c)).toBe(`/account/complete?next=${encodeURIComponent(`/events/${EVENT}?ref=card`)}`);
  });

  it('adds no hop and no hidden field when there is no destination', async () => {
    const c = await render_(new URLSearchParams(''));
    expect(formNext(c)).toBeNull();
  });

  it.each(['//evil.example', '/\\evil', '/dashboard', '/login', '/account/../dashboard'])(
    'ignores a hostile or other-audience destination (%j): no hidden field, no next on the Sign in link',
    async (hostile) => {
      const c = await render_(new URLSearchParams({ next: hostile }));
      expect(formNext(c)).toBeNull();
      expect(await signInLinkHrefs()).toEqual(['/account/sign-in', '/account/sign-in']);
    },
  );

  it('does not wrap a destination that is already the wizard', async () => {
    const c = await render_(new URLSearchParams({ next: '/account/complete' }));
    expect(formNext(c)).toBe('/account/complete');
  });
});
