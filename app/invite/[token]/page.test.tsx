/** @vitest-environment jsdom */
import { vi } from 'vitest';

// The invite page reads the browser session (signed in or not), calls the
// acceptInvite Server Action, and routes with next/navigation. Each of those is
// stubbed so every state of the page can be driven directly.
const { getSession, signOut, acceptInvite, router } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  acceptInvite: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({ auth: { getSession, signOut } }),
}));
vi.mock('./actions', () => ({ acceptInvite }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tok-123' }),
  useRouter: () => router,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InviteAcceptPage from './page';

// The first render in a cold worker is slow under a loaded machine; keep the
// async queries from timing out on that alone.
configure({ asyncUtilTimeout: 3000 });

const SIGN_IN_HREF = '/login?next=%2Finvite%2Ftok-123';

function signedOut() {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
}
function signedIn() {
  getSession.mockResolvedValue({ data: { session: { user: { email: 'invitee@example.com' } } }, error: null });
}

const acceptButton = () => screen.findByRole('button', { name: /^accept invite$/i });
const promptHeading = () => screen.findByRole('heading', { name: /this email already has practitioner records/i });

beforeEach(() => {
  getSession.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  acceptInvite.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(cleanup);

// B1 (2026-09-25): a signed-out invitee used to get a page whose only sign-in
// control was the shell's pill — the practitioner door, with the invite lost.
describe('invite page — signed out', () => {
  beforeEach(signedOut);

  it('offers "Sign in to accept" through the organiser door, carrying the invite', async () => {
    render(<InviteAcceptPage />);
    const link = await screen.findByRole('link', { name: /^sign in to accept$/i });
    expect(link).toHaveAttribute('href', SIGN_IN_HREF);
    // The accept button would only lead to a "must be signed in" error.
    expect(screen.queryByRole('button', { name: /^accept invite$/i })).not.toBeInTheDocument();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('offers the sign-in link when the browser session cannot be read at all (getSession rejects)', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'));
    render(<InviteAcceptPage />);
    const link = await screen.findByRole('link', { name: /^sign in to accept$/i });
    expect(link).toHaveAttribute('href', SIGN_IN_HREF);
  });

  it('decodes to the invite path: /login?next=/invite/<token>', async () => {
    render(<InviteAcceptPage />);
    const link = await screen.findByRole('link', { name: /^sign in to accept$/i });
    const url = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/invite/tok-123');
  });

  it('shows neither action while the session check is still running', async () => {
    let resolveSession!: (value: unknown) => void;
    getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    render(<InviteAcceptPage />);
    expect(screen.getByRole('heading', { name: /join your team/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept invite$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign in to accept$/i })).not.toBeInTheDocument();
    resolveSession({ data: { session: null }, error: null });
    expect(await screen.findByRole('link', { name: /^sign in to accept$/i })).toBeInTheDocument();
  });
});

describe('invite page — signed in', () => {
  beforeEach(signedIn);

  it('"Accept invite" calls the action unconfirmed and shows the success screen', async () => {
    acceptInvite.mockResolvedValue({ orgName: 'Acme Training' });
    render(<InviteAcceptPage />);
    expect(screen.queryByRole('link', { name: /^sign in to accept$/i })).not.toBeInTheDocument();
    fireEvent.click(await acceptButton());

    expect(await screen.findByRole('heading', { name: /you're in/i })).toBeInTheDocument();
    expect(screen.getByText('Acme Training')).toBeInTheDocument();
    expect(acceptInvite).toHaveBeenCalledTimes(1);
    expect(acceptInvite).toHaveBeenCalledWith('tok-123', { confirmed: false });

    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a plain error for a failed accept, without a sign-in link', async () => {
    acceptInvite.mockResolvedValue({ error: 'This invite link has expired.' });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite link has expired.');
    expect(screen.queryByRole('link', { name: /^sign in to accept$/i })).not.toBeInTheDocument();
  });

  // The browser session can look present while the server has already lost it.
  it('the "must be signed in" error carries the same sign-in link', async () => {
    acceptInvite.mockResolvedValue({
      error: 'You must be signed in to accept an invite.',
      needsSignIn: true,
    });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('You must be signed in to accept an invite.');
    expect(screen.getByRole('link', { name: /^sign in to accept$/i })).toHaveAttribute('href', SIGN_IN_HREF);
  });

  // Rule 12: a rejected Server Action (network down) must not become a
  // crashed page or a button stuck on "Joining…".
  it('a rejected action shows an error and leaves the button usable', async () => {
    acceptInvite.mockRejectedValue(new Error('network down'));
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    // A dropped connection is not the admin's doing: no "ask your admin" here.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't reach eventar just now/i);
    expect(alert).not.toHaveTextContent(/admin/i);
    expect(screen.getByRole('button', { name: /^accept invite$/i })).toBeEnabled();
  });

  it('disables the button and says "Joining…" while the action runs', async () => {
    let finish!: (value: unknown) => void;
    acceptInvite.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    expect(await screen.findByRole('button', { name: /joining/i })).toBeDisabled();
    finish({ orgName: 'Acme Training' });
    expect(await screen.findByRole('heading', { name: /you're in/i })).toBeInTheDocument();
  });
});

// D3 (2026-09-25): an invitee whose email already holds practitioner records
// is asked to use a separate organiser email — and may decline.
describe('invite page — the email already has practitioner data (D3)', () => {
  beforeEach(() => {
    signedIn();
    acceptInvite.mockResolvedValueOnce({ needsConfirm: true, email: 'invitee@example.com' });
  });

  async function reachPrompt() {
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    return promptHeading();
  }

  it('shows the prompt with the email and both choices instead of accepting', async () => {
    await reachPrompt();
    expect(screen.getByText(/invitee@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/we recommend signing up for your organiser account with a different email/i)).toBeInTheDocument();
    expect(screen.getByText(/those records stay saved, but you won't be able to open them/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^use a different email$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^accept with this email anyway$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept invite$/i })).not.toBeInTheDocument();
    // Nothing was accepted yet.
    expect(acceptInvite).toHaveBeenCalledTimes(1);
    expect(acceptInvite).toHaveBeenCalledWith('tok-123', { confirmed: false });
  });

  it('moves focus to the prompt heading so keyboard users are not dropped on the page', async () => {
    const heading = await reachPrompt();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('"Accept with this email anyway" accepts with confirmed: true', async () => {
    await reachPrompt();
    acceptInvite.mockResolvedValueOnce({ orgName: 'Acme Training' });
    fireEvent.click(screen.getByRole('button', { name: /^accept with this email anyway$/i }));

    expect(await screen.findByRole('heading', { name: /you're in/i })).toBeInTheDocument();
    expect(acceptInvite).toHaveBeenLastCalledWith('tok-123', { confirmed: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('"Use a different email" signs out, then goes to /login carrying the invite', async () => {
    await reachPrompt();
    fireEvent.click(screen.getByRole('button', { name: /^use a different email$/i }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(SIGN_IN_HREF));
    expect(signOut).toHaveBeenCalledTimes(1);
    // The invite was not accepted on the way out.
    expect(acceptInvite).toHaveBeenCalledTimes(1);
  });

  it('a failed sign-out stays on the prompt with an inline error and does not navigate (rule 12)', async () => {
    await reachPrompt();
    signOut.mockResolvedValue({ error: new Error('network down') });
    fireEvent.click(screen.getByRole('button', { name: /^use a different email$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sign you out. Try again.");
    expect(router.push).not.toHaveBeenCalled();
    expect(await promptHeading()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^use a different email$/i })).toBeEnabled();
  });

  it('an error on the confirmed accept shows inline and keeps the choices', async () => {
    await reachPrompt();
    acceptInvite.mockResolvedValueOnce({ error: "We couldn't accept this invite. Try again, or ask your admin for a new link." });
    fireEvent.click(screen.getByRole('button', { name: /^accept with this email anyway$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't accept this invite/i);
    expect(screen.getByRole('button', { name: /^accept with this email anyway$/i })).toBeEnabled();
  });
});

// Band 1 review F6: the used, expired, unknown and already-a-member states all
// left an active Accept button and no next step. A `final` failure swaps the
// card for a closing frame that says why and what to do.
describe('invite page — an invite that cannot be accepted', () => {
  beforeEach(signedIn);

  const used = { error: 'This invite link has already been used. Ask your admin for a new one.', final: true };

  it('replaces the card with a closing frame: heading, the reason and next step, no live button', async () => {
    acceptInvite.mockResolvedValue(used);
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());

    const heading = await screen.findByRole('heading', { name: /this invite can't be used/i });
    expect(screen.getByText(/ask your admin for a new one/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept invite$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to dashboard/i })).not.toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('"already a member" says so and offers the dashboard', async () => {
    acceptInvite.mockResolvedValue({ error: "You're already a member of this organisation.", final: true, alreadyMember: true });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());

    expect(await screen.findByRole('heading', { name: /you're already on this team/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('a final failure after the D3 prompt replaces the prompt too (no contradictory choices under it)', async () => {
    acceptInvite.mockResolvedValueOnce({ needsConfirm: true, email: 'invitee@example.com' });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    await promptHeading();

    acceptInvite.mockResolvedValueOnce({ error: "You're already a member of this organisation.", final: true, alreadyMember: true });
    fireEvent.click(screen.getByRole('button', { name: /^accept with this email anyway$/i }));

    expect(await screen.findByRole('heading', { name: /you're already on this team/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^use a different email$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept with this email anyway$/i })).not.toBeInTheDocument();
  });
});

// Band 1 review F7: the button is disabled while the action runs, which drops
// keyboard focus on <body>. After a retryable error focus goes to the error
// itself (a screen reader reads it where focus is; moving to the button could cut
// the alert short, dev-lens round 2).
describe('invite page — focus after a retryable error', () => {
  beforeEach(signedIn);

  it('moves focus to the error message when the attempt fails', async () => {
    // A browser drops focus when the focused button becomes disabled; jsdom
    // does not, so do it by hand or the test would pass without the fix.
    acceptInvite.mockImplementation(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      return { error: "We couldn't check your account just now. Try again." };
    });
    render(<InviteAcceptPage />);
    const button = await acceptButton();
    button.focus();
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('does the same when the sign-out for "Use a different email" fails', async () => {
    acceptInvite.mockResolvedValueOnce({ needsConfirm: true, email: 'invitee@example.com' });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    await promptHeading();

    signOut.mockResolvedValue({ error: new Error('network down') });
    fireEvent.click(screen.getByRole('button', { name: /^use a different email$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't sign you out. Try again.");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

// Dev-lens round 2: someone who already joined with this link and reopens the
// email lands on the "used" frame; "ask your admin for a new one" is wrong advice
// for them.
describe('invite page — a used link', () => {
  beforeEach(signedIn);

  it('offers the dashboard to someone who may be the one who used it', async () => {
    acceptInvite.mockResolvedValue({
      error: 'This invite link has already been used. Ask your admin for a new one.',
      final: true,
      used: true,
    });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());

    await screen.findByRole('heading', { name: /this invite can't be used/i });
    fireEvent.click(screen.getByRole('button', { name: /already joined\? go to your dashboard/i }));
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });

  it.each([
    ['expired', 'This invite link has expired. Ask your admin for a new one.'],
    ['invalid', "This invite link isn't valid. Check that you copied all of it, or ask your admin for a new one."],
  ])('does not offer the dashboard for an %s link (nobody who joined with it lands here)', async (_kind, message) => {
    acceptInvite.mockResolvedValue({ error: message, final: true });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());

    await screen.findByRole('heading', { name: /this invite can't be used/i });
    expect(screen.queryByRole('button', { name: /dashboard/i })).not.toBeInTheDocument();
  });
});

// The card used `py-2xl`, a class with no token behind it (the spacing token is
// `xxl`), so it generated no padding and the card sat under the sticky header.
describe('invite page — card spacing', () => {
  it('uses a spacing class that exists (py-xl, like the door pages)', async () => {
    signedOut();
    const { container } = render(<InviteAcceptPage />);
    await screen.findByRole('link', { name: /^sign in to accept$/i });
    expect(container.querySelector('.py-xl')).not.toBeNull();
    expect(container.querySelector('.py-2xl')).toBeNull();
  });
});


// User-lens round 2 (m1, m2, m6): the page never said who was signed in, the
// error sat below the button it belongs to, and the success button was 32 px.
describe('invite page — who, where the error sits, target size', () => {
  beforeEach(signedIn);

  it('says which account is signed in before the person presses Accept', async () => {
    render(<InviteAcceptPage />);
    await acceptButton();
    expect(screen.getByText(/you're signed in as/i)).toHaveTextContent('invitee@example.com');
  });

  it('says nothing about an account when signed out', async () => {
    signedOut();
    render(<InviteAcceptPage />);
    await screen.findByRole('link', { name: /^sign in to accept$/i });
    expect(screen.queryByText(/you're signed in as/i)).not.toBeInTheDocument();
  });

  it('names the account that joined on the success screen', async () => {
    acceptInvite.mockResolvedValue({ orgName: 'Acme Training' });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    expect(await screen.findByText(/you've joined/i)).toHaveTextContent("You've joined Acme Training as invitee@example.com.");
  });

  it('keeps the success button at the 44 px target the other buttons use', async () => {
    acceptInvite.mockResolvedValue({ orgName: 'Acme Training' });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    expect(await screen.findByRole('button', { name: /go to dashboard/i })).toHaveClass('min-h-11');
  });

  // Focus lands on the error; Tab from there should reach the button to retry
  // rather than skip past it to the footer.
  it('puts the error before the Accept button in the tab order', async () => {
    acceptInvite.mockResolvedValue({ error: "We couldn't check your account just now. Try again." });
    render(<InviteAcceptPage />);
    fireEvent.click(await acceptButton());
    const alert = await screen.findByRole('alert');
    const button = screen.getByRole('button', { name: /^accept invite$/i });
    expect(alert.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
