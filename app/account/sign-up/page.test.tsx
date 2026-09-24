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
    mockSearchParams = new URLSearchParams('next=/events/abc123');
    render(<AttendeeSignUpPage />);
    const hrefs = await signInLinkHrefs();
    // The nav's own Sign-in pill never carries ?next= (it doesn't know about
    // this page's next param); the in-page link does.
    expect(hrefs).toContain('/account/sign-in');
    expect(hrefs).toContain(`/account/sign-in?next=${encodeURIComponent('/events/abc123')}`);
  });
});
