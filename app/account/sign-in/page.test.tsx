/** @vitest-environment jsdom */
import { vi } from 'vitest';

// AttendeeSignInPage uses useSearchParams + supabaseBrowser().auth.getSession()
// to short-circuit for already-signed-in visitors, and it renders
// MagicLinkSignInForm (which is a client component). Mock the browser client
// so getSession() returns "no session" — the form then mounts and every copy
// assertion below is reachable.
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
// Server Action stubbed — nothing in these tests exercises a submit.
vi.mock('./actions', () => ({
  sendAttendeeMagicLink: vi.fn(async () => ({ ok: true as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AttendeeSignInPage from './page';

afterEach(() => {
  cleanup();
  mockSearchParams = new URLSearchParams('');
});

describe('AttendeeSignInPage — trouble-signing-in help', () => {
  it('renders the "Trouble logging in?" details block once the form is shown', async () => {
    render(<AttendeeSignInPage />);
    // The page holds the form out of the tree until the getSession() check
    // resolves; wait for the summary to appear.
    await waitFor(() =>
      expect(screen.getByText(/trouble logging in\?/i)).toBeInTheDocument(),
    );
    // Three bullets at most: expiry, spam/newest email, same browser + registered address.
    expect(screen.getByText(/links expire after 15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/check spam/i)).toBeInTheDocument();
    expect(screen.getByText(/use the address you registered with/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText(/contact the event organiser/i)).not.toBeInTheDocument();
    // No "soft-security reassurance" that reads as a policy statement.
    expect(screen.queryByText(/we don.t restrict who can register/i)).not.toBeInTheDocument();
    // Never leak the "staff" framing on the attendee door.
    expect(screen.queryByText(/staff list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/staff record/i)).not.toBeInTheDocument();
  });

  it('carries one heading and one short sentence, with no eyebrow, guest paragraph, expiry line or helper copy', async () => {
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^log in$/i })).toBeInTheDocument());
    expect(screen.getByText('We’ll email a one-time link, no password.')).toBeInTheDocument();
    expect(screen.queryByText(/attendee/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/guest registration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not reveal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the link expires after 15 minutes and works once/i)).not.toBeInTheDocument();
  });

  it('renders the error immediately when ?error= is on the URL, without waiting on the session check (soft-loop fix)', () => {
    // Regression: sessionKnown lazy-initializes to true whenever an error
    // code is present, so the form (and its error banner) must already be
    // in the DOM on the very first render — never gated behind the
    // getSession() round-trip that previously caused a staff-account
    // redirect loop (session exists, no `users` row, back to
    // /account/sign-in?error=..., which re-triggered the same redirect).
    mockSearchParams = new URLSearchParams('error=missing_code');
    render(<AttendeeSignInPage />);
    expect(screen.getByText(/this log-in link has expired or was already used/i)).toBeInTheDocument();
  });
});

// Spec 001 FR-005: the destination the door forwards to the emailed link is an
// attendee path or nothing. (The action gates again; this is the page's half.)
describe('AttendeeSignInPage — next', () => {
  async function formNext(next: string) {
    mockSearchParams = new URLSearchParams({ next });
    const { container } = render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    return container.querySelector<HTMLInputElement>('input[name="next"]')?.value ?? null;
  }

  it('hands an attendee destination to the form', async () => {
    expect(await formNext('/account/claim')).toBe('/account/claim');
  });

  it.each(['//evil.example', '/\\evil', '/dashboard', '/login', '/account/../dashboard'])(
    'does not hand %j to the form',
    async (hostile) => {
      expect(await formNext(hostile)).toBeNull();
    },
  );
});

describe('AttendeeSignInPage — door switch', () => {
  it('offers Sign up on this door, pointing at the sign-up door', async () => {
    mockSearchParams = new URLSearchParams();
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /^sign up$/i })).toHaveAttribute('href', '/account/sign-up');
  });

  // S1-2: a visitor who started on an event and picks "Sign up" must not lose it.
  it('carries a valid next through the Sign up link', async () => {
    mockSearchParams = new URLSearchParams('next=/events/37e37c81-b10a-4077-8f7d-5b5d247b1adc');
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /^sign up$/i })).toHaveAttribute(
      'href',
      `/account/sign-up?next=${encodeURIComponent('/events/37e37c81-b10a-4077-8f7d-5b5d247b1adc')}`,
    );
  });

  it('never forwards a hostile next to the Sign up link', async () => {
    mockSearchParams = new URLSearchParams('next=//evil.example/x');
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /^sign up$/i })).toHaveAttribute('href', '/account/sign-up');
  });
});

describe('AttendeeSignInPage — no self-links', () => {
  it('shows the nav Log in pill as the current page, not a link, and links only to sign up beside the nav', async () => {
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.tagName).toBe('SPAN');
    expect(current).toHaveTextContent(/^log in$/i);
    const main = screen.getByRole('main');
    expect(Array.from(main.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Sign up']);
  });

  // Ivan 2026-11-22: a wrong-page helper line shows only after two failed log-ins, counted in the browser.
  it('shows no organiser helper line until two log-ins have failed, then points at /login', async () => {
    const { sendAttendeeMagicLink } = await import('./actions');
    vi.mocked(sendAttendeeMagicLink).mockResolvedValue({ error: 'Could not send a link.' });
    render(<AttendeeSignInPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /^log in as an organiser$/i })).not.toBeInTheDocument();
    for (let i = 1; i <= 2; i++) {
      fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
      fireEvent.click(await screen.findByRole('button', { name: /^next$/i }));
      await waitFor(() => expect(sendAttendeeMagicLink).toHaveBeenCalledTimes(i));
      await screen.findAllByText(/could not send/i);
    }
    expect(await screen.findByRole('link', { name: /^log in as an organiser$/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/a@example\.com/)).not.toBeInTheDocument();
  });
});
