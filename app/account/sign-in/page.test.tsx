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
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
// Server Action stubbed — nothing in these tests exercises a submit.
vi.mock('./actions', () => ({
  sendAttendeeMagicLink: vi.fn(async () => ({ ok: true as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AttendeeSignInPage from './page';

afterEach(cleanup);

describe('AttendeeSignInPage — trouble-signing-in help', () => {
  it('renders the "Trouble signing in?" details block once the form is shown', async () => {
    render(<AttendeeSignInPage />);
    // The page holds the form out of the tree until the getSession() check
    // resolves; wait for the summary to appear.
    await waitFor(() =>
      expect(screen.getByText(/trouble signing in\?/i)).toBeInTheDocument(),
    );
    // Bullets — first two ported from /login (link expiry, spam). Bullet 3
    // guides at the actual common failure (typo/wrong address at signup).
    // Bullets 4/5 acknowledge the honest dead end when the inbox is lost
    // (user-lens BLOCKER 2 fix).
    expect(screen.getByText(/links expire after 15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/check spam/i)).toBeInTheDocument();
    expect(screen.getByText(/same address you used when registering/i)).toBeInTheDocument();
    expect(screen.getByText(/contact the event organizer for help/i)).toBeInTheDocument();
    // No "soft-security reassurance" that reads as a policy statement.
    expect(screen.queryByText(/we don.t restrict who can register/i)).not.toBeInTheDocument();
    // Never leak the "staff" framing on the attendee door.
    expect(screen.queryByText(/staff list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/staff record/i)).not.toBeInTheDocument();
  });

  it('MagicLinkSignInForm receives audience="attendee" (help copy check)', async () => {
    render(<AttendeeSignInPage />);
    // The audience prop drives the help sentence rendered by the shared
    // component; the attendee flavour drops the organizer wording.
    await waitFor(() =>
      expect(screen.getByText(/account already exists/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/organizer list/i)).not.toBeInTheDocument();
  });
});
