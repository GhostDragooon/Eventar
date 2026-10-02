/** @vitest-environment jsdom */
import { vi } from 'vitest';

// /login reads the browser session (like /account/sign-in) and, when one
// exists, asks the server who it is via getAccountMenuState. Everything that
// crosses a boundary is stubbed so each branch of D1 can be driven directly.
const { getSession, signOut, getAccountMenuState, router } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  getAccountMenuState: vi.fn(),
  // A stable router object: the page's effect depends on it, exactly as the
  // real (memoised) app router behaves.
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({ auth: { getSession, signOut } }),
}));
vi.mock('@/app/account/actions', () => ({ getAccountMenuState }));
let mockSearchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => router,
}));
vi.mock('./actions', () => ({
  sendMagicLink: vi.fn(async () => ({ ok: true as const })),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from './page';

// The first render in a cold worker is slow under a loaded machine (jsdom +
// the whole shell); keep the async queries from timing out on that alone.
configure({ asyncUtilTimeout: 3000 });

const EMAIL = 'practitioner@example.com';

function noSession() {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
}
function sessionAs(email = EMAIL) {
  getSession.mockResolvedValue({ data: { session: { user: { email } } }, error: null });
}
function staff(isStaff: boolean) {
  getAccountMenuState.mockResolvedValue({ isStaff, accountComplete: true, unlinkedCount: 0 });
}
function visit(query: string) {
  mockSearchParams = new URLSearchParams(query);
  return render(<LoginPage />);
}

const emailField = () => screen.queryByLabelText(/email address/i);
const panelHeading = () => screen.queryByRole('heading', { name: /^organiser log in$/i });

beforeEach(() => {
  getSession.mockReset();
  signOut.mockReset();
  getAccountMenuState.mockReset();
  router.replace.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  cleanup();
  mockSearchParams = new URLSearchParams('');
});

describe('/login — no session', () => {
  it('shows the magic-link form and the organiser-only notice', async () => {
    noSession();
    visit('');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/organizer access only/i)).toBeInTheDocument();
    expect(panelHeading()).not.toBeInTheDocument();
    expect(getAccountMenuState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('forwards a valid ?next= into the form', async () => {
    noSession();
    const { container } = visit('next=%2Fevents%2Fnew');
    await screen.findByLabelText(/email address/i);
    expect(container.querySelector('input[name="next"]')).toHaveValue('/events/new');
  });

  // I2 (2026-09-25): the form used to render with zero knowledge of the
  // session, so a signed-in visitor could submit it before anything else
  // happened. Same discipline as /account/sign-in.
  it('holds the form out of the render tree until the session check resolves', async () => {
    let resolveSession!: (value: unknown) => void;
    getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    visit('');
    expect(emailField()).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    resolveSession({ data: { session: null }, error: null });
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
  });

  // M1: the shell's "Sign in" pill points at the practitioner door, so
  // highlighting it on the organiser door was wrong.
  it('does not highlight the shell\'s attendee "Sign in" pill as the current page', async () => {
    noSession();
    visit('');
    await screen.findByLabelText(/email address/i);
    const pill = screen.getByRole('link', { name: /^sign in$/i });
    expect(pill).toHaveAttribute('href', '/account/sign-in');
    expect(pill).not.toHaveAttribute('aria-current');
  });
});

describe('/login — signed-in organiser (I2)', () => {
  beforeEach(() => {
    sessionAs('organiser@example.com');
    staff(true);
  });

  it('forwards to an organiser ?next= without ever showing the form', async () => {
    visit('next=%2Fevents%2Fnew');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/events/new'));
    expect(emailField()).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps the query string of an organiser destination', async () => {
    visit(`next=${encodeURIComponent('/dashboard/manage?tab=drafts')}`);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard/manage?tab=drafts'));
  });

  it('goes to /dashboard when there is no ?next=', async () => {
    visit('');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it.each([
    ['an attendee path', '/account/record'],
    ['a neutral path', '/pricing'],
    ['a protocol-relative URL', '//evil.example.com/dashboard'],
    ['an absolute URL', 'https://evil.example.com/dashboard'],
  ])('rejects %s as a destination and goes to /dashboard', async (_label, next) => {
    visit(`next=${encodeURIComponent(next)}`);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});

describe('/login — signed-in practitioner (D1)', () => {
  beforeEach(() => {
    sessionAs();
    staff(false);
  });

  it('explains the session instead of showing the form, and never signs them out', async () => {
    visit('next=%2Fevents%2Fnew');
    expect(await screen.findByRole('heading', { name: /^organiser log in$/i })).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    // True for any non-organiser session, and says how to become one: the old
    // line claimed a "practitioner account" the visitor may never have made.
    expect(screen.getByText(/this email isn't on an organiser team\./i)).toBeInTheDocument();
    expect(screen.getByText(/open the invite link your admin sent you, or ask an admin to add you/i)).toBeInTheDocument();
    expect(screen.queryByText(/a practitioner account/i)).not.toBeInTheDocument();
    // The form and the allowlist notice are hidden while the panel shows.
    expect(emailField()).not.toBeInTheDocument();
    expect(screen.queryByText(/organizer access only/i)).not.toBeInTheDocument();
    // The whole point of D1: the session survives this page.
    expect(signOut).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('"Back to my record" goes to /account/record', async () => {
    visit('');
    const back = await screen.findByRole('link', { name: /^back to my record$/i });
    expect(back).toHaveAttribute('href', '/account/record');
  });

  // The shell must agree with the card: it said "Sign in" above a card that
  // said "you're signed in".
  it('shows signed-in chrome rather than the "Sign in" pill', async () => {
    visit('');
    await screen.findByRole('heading', { name: /^organiser log in$/i });
    expect(screen.getByRole('button', { name: /^account$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('?error=not_organiser (the proxy bounce) shows the same panel, not the error banner', async () => {
    visit('error=not_organiser&next=%2Fevents%2Fnew');
    expect(await screen.findByRole('heading', { name: /^organiser log in$/i })).toBeInTheDocument();
    expect(screen.queryByText(/that page is for organisers/i)).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  // B1: an invitee has no staff row yet — that is what accepting creates — so
  // the panel would wrongly turn them away. They go straight on to the invite.
  it('forwards an /invite/<token> destination instead of showing the panel', async () => {
    visit(`next=${encodeURIComponent('/invite/abc123')}`);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/invite/abc123'));
    expect(panelHeading()).not.toBeInTheDocument();
    expect(emailField()).not.toBeInTheDocument();
  });

  it('does not treat other organiser paths as an invite (panel still shows)', async () => {
    visit(`next=${encodeURIComponent('/dashboard')}`);
    expect(await screen.findByRole('heading', { name: /^organiser log in$/i })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  describe('"Sign out and use another email"', () => {
    it('signs out, then swaps to the normal form and keeps ?next=', async () => {
      signOut.mockResolvedValue({ error: null });
      const { container } = visit('next=%2Fevents%2Fnew');
      fireEvent.click(await screen.findByRole('button', { name: /sign out and use another email/i }));

      expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(panelHeading()).not.toBeInTheDocument();
      expect(screen.getByText(/organizer access only/i)).toBeInTheDocument();
      expect(container.querySelector('input[name="next"]')).toHaveValue('/events/new');
      // Signed-out chrome again.
      expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument();
    });

    it('moves focus to the form heading so keyboard users are not dropped on the page', async () => {
      signOut.mockResolvedValue({ error: null });
      visit('');
      fireEvent.click(await screen.findByRole('button', { name: /sign out and use another email/i }));
      const heading = await screen.findByRole('heading', { name: /welcome back/i });
      await waitFor(() => expect(heading).toHaveFocus());
    });

    it('shows an inline error and keeps the panel when sign-out fails (rule 12)', async () => {
      signOut.mockResolvedValue({ error: new Error('network down') });
      visit('');
      fireEvent.click(await screen.findByRole('button', { name: /sign out and use another email/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sign you out. Try again.");
      expect(panelHeading()).toBeInTheDocument();
      expect(emailField()).not.toBeInTheDocument();
      // The button is usable again for a retry.
      expect(screen.getByRole('button', { name: /sign out and use another email/i })).toBeEnabled();
    });

    it('treats a thrown sign-out the same as a returned error', async () => {
      signOut.mockRejectedValue(new Error('boom'));
      visit('');
      fireEvent.click(await screen.findByRole('button', { name: /sign out and use another email/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sign you out. Try again.");
      expect(panelHeading()).toBeInTheDocument();
    });

    it('clears the error once a retry succeeds', async () => {
      signOut.mockResolvedValueOnce({ error: new Error('network down') }).mockResolvedValueOnce({ error: null });
      visit('');
      const button = await screen.findByRole('button', { name: /sign out and use another email/i });
      fireEvent.click(button);
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: /sign out and use another email/i }));
      expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.queryByText(/couldn't sign you out/i)).not.toBeInTheDocument();
    });
  });
});

describe('/login — ?error= codes', () => {
  // D1: a pasted not_organiser URL with nobody signed in.
  it('?error=not_organiser with no session shows the form plus the organiser copy', async () => {
    noSession();
    visit('error=not_organiser&next=%2Fevents%2Fnew');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That page is for organisers. Sign in with your organiser email.',
    );
  });

  // The attendee door's soft-loop guard, kept: an upstream failure means the
  // session check already ran once, so redirecting again could loop.
  it.each(['unavailable', 'not_authorized', 'missing_code', 'exchange_failed'])(
    '?error=%s renders the form with its message immediately and skips the session check',
    async (code) => {
      visit(`error=${code}`);
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(getSession).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    },
  );
});

describe('/login — failures fail visibly (rule 12)', () => {
  it('shows the form with an honest "could not check" message when the role lookup throws', async () => {
    sessionAs();
    getAccountMenuState.mockRejectedValue(new Error('server action failed'));
    visit('next=%2Fevents%2Fnew');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not check your organizer access/i);
    expect(router.replace).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  // m1: the server could not say whether this session is staff. A practitioner
  // verdict here would be an unchecked claim aimed at a possible organiser.
  it('shows the "could not check" form, not the practitioner panel, when the server cannot tell who is signed in', async () => {
    sessionAs();
    getAccountMenuState.mockResolvedValue({ isStaff: false, accountComplete: false, unlinkedCount: 0, staffUnknown: true });
    visit('next=%2Fevents%2Fnew');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not check your organizer access/i);
    expect(screen.queryByText(/organiser team/i)).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('an invitee heading to /invite is still forwarded even when the staff read failed (the invite does not depend on it)', async () => {
    sessionAs();
    getAccountMenuState.mockResolvedValue({ isStaff: false, accountComplete: false, unlinkedCount: 0, staffUnknown: true });
    visit('next=%2Finvite%2Ftok-1');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/invite/tok-1'));
  });

  it('falls back to the form (not "Loading…" forever) when getSession itself rejects', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'));
    visit('');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('falls back to the form when the browser session cannot be read', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: new Error('storage blocked') });
    visit('');
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('copes with a practitioner session that has no email on it', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    staff(false);
    visit('');
    expect(await screen.findByRole('heading', { name: /^organiser log in$/i })).toBeInTheDocument();
    expect(screen.getByText(/this account isn't on an organiser team/i)).toBeInTheDocument();
  });
});

// Band 1 review F2: an invitee used to meet "Welcome back", "Organizer access
// only ... Contact an admin to be added" and "ask an admin to add you" on the
// way to accepting an invite they already had.
describe('/login — arriving from an invite link', () => {
  const INVITE = 'next=%2Finvite%2Ftok-1';

  beforeEach(noSession);

  it('says what this sign-in is for, and drops the "contact an admin" notice', async () => {
    visit(INVITE);
    expect(await screen.findByRole('heading', { name: /sign in to accept your invite/i })).toBeInTheDocument();
    expect(screen.getByText(/bring you straight back to your invite/i)).toBeInTheDocument();
    expect(screen.queryByText(/organizer access only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contact an admin to be added/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument();
  });

  it('tells them which address to use instead of mentioning an organizer list', async () => {
    visit(INVITE);
    await screen.findByLabelText(/email address/i);
    expect(screen.getByText(/use the address you want for your organiser account/i)).toBeInTheDocument();
    expect(screen.queryByText(/organizer list/i)).not.toBeInTheDocument();
  });

  it('the "Trouble signing in?" list no longer says only listed organizers can sign in', async () => {
    visit(INVITE);
    await screen.findByLabelText(/email address/i);
    expect(screen.queryByText(/only organizer emails can sign in/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your invite link is separate from the sign-in link, and works once/i)).toBeInTheDocument();
    // Sign-in links and the invite link are different things; the list says so.
    expect(screen.getByText(/sign-in links expire after 15 minutes/i)).toBeInTheDocument();
  });

  it('keeps the invite in the form so the magic link lands back on it', async () => {
    const { container } = visit(INVITE);
    await screen.findByLabelText(/email address/i);
    expect(container.querySelector('input[name="next"]')).toHaveValue('/invite/tok-1');
  });

  it('every other organiser destination keeps the original door copy', async () => {
    visit('next=%2Fevents%2Fnew');
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/organizer access only/i)).toBeInTheDocument();
    expect(screen.getByText(/only organizer emails can sign in/i)).toBeInTheDocument();
  });
});

// Band 1 review F3: a never-registered address that asks for an organiser link
// is signed in with no practitioner footprint at all. "Back to my record" led it
// into practitioner onboarding as the primary action.
describe('/login — signed in with no practitioner record yet (F3)', () => {
  beforeEach(() => {
    sessionAs('newcomer@example.com');
    getAccountMenuState.mockResolvedValue({ isStaff: false, accountComplete: false, unlinkedCount: 0 });
  });

  it('makes "Sign out and use another email" the primary action and calls the other link "Go to my account"', async () => {
    visit('');
    const signOutButton = await screen.findByRole('button', { name: /sign out and use another email/i });
    const accountLink = screen.getByRole('link', { name: /^go to my account$/i });
    expect(accountLink).toHaveAttribute('href', '/account/record');
    expect(screen.queryByRole('link', { name: /back to my record/i })).not.toBeInTheDocument();
    // Sign-out leads (first in DOM order).
    expect(signOutButton.compareDocumentPosition(accountLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a session with registrations to claim still gets "Back to my record" first', async () => {
    getAccountMenuState.mockResolvedValue({ isStaff: false, accountComplete: false, unlinkedCount: 2 });
    visit('');
    const record = await screen.findByRole('link', { name: /^back to my record$/i });
    const signOutButton = screen.getByRole('button', { name: /sign out and use another email/i });
    expect(record.compareDocumentPosition(signOutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});


// The same tailwind-merge eviction hit the practitioner panel's primary control.
describe('/login — the primary control keeps its text colour', () => {
  it('"Back to my record" (a record exists)', async () => {
    sessionAs();
    staff(false);
    visit('');
    const link = await screen.findByRole('link', { name: /^back to my record$/i });
    expect(link.className).toMatch(/(^|\s)text-on-primary!?(\s|$)/);
    expect(link.className).toMatch(/(^|\s)text-label-md(\s|$)/);
  });

  it('"Sign out and use another email" (no record yet, so it leads)', async () => {
    sessionAs('newcomer@example.com');
    getAccountMenuState.mockResolvedValue({ isStaff: false, accountComplete: false, unlinkedCount: 0 });
    visit('');
    const button = await screen.findByRole('button', { name: /sign out and use another email/i });
    expect(button.className).toMatch(/(^|\s)text-on-primary!?(\s|$)/);
    expect(button.className).toMatch(/(^|\s)text-label-md(\s|$)/);
  });
});

// `/invite` and `/invite/` carry no token: they are not an invite, so they must
// not get the invitee copy or the practitioner forward.
describe('/login — a bare /invite is not an invite', () => {
  it.each(['/invite', '/invite/'])('%s signed out shows the ordinary organiser door', async (next) => {
    noSession();
    visit(`next=${encodeURIComponent(next)}`);
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in to accept your invite/i })).not.toBeInTheDocument();
  });

  it.each(['/invite', '/invite/'])('%s signed in as a practitioner is not forwarded', async (next) => {
    sessionAs();
    staff(false);
    visit(`next=${encodeURIComponent(next)}`);
    expect(await screen.findByRole('heading', { name: /^organiser log in$/i })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});


// User-lens round 2, M2: a link opened in another browser, device or a mail app's
// built-in browser fails like an expired one; the help list has to say how to avoid it.
describe('/login — the "Trouble signing in?" list names the different-browser cause', () => {
  it.each([['ordinary door', ''], ['invite door', 'next=%2Finvite%2Ftok-1']])('%s', async (_name, query) => {
    noSession();
    visit(query);
    await screen.findByLabelText(/email address/i);
    expect(screen.getByText(/open the link in the same browser you asked for it in/i)).toBeInTheDocument();
  });
});

// User-lens round 2, m4: after a deliberate sign-out the form opened under a red
// "That page is for organisers" banner because the URL still carried the error.
describe('/login — sign out from the panel', () => {
  it('does not greet the person with the not_organiser error afterwards', async () => {
    sessionAs();
    staff(false);
    signOut.mockResolvedValue({ error: null });
    visit('error=not_organiser&next=%2Fevents%2Fnew');
    fireEvent.click(await screen.findByRole('button', { name: /sign out and use another email/i }));

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByText(/that page is for organisers/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
