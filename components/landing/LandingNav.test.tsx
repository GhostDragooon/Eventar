/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LandingNav } from './LandingNav';

afterEach(cleanup);

// Stub the browser Supabase client — LandingAuthPill (used when `signedIn`
// is undefined) calls `supabaseBrowser().auth.getSession()` on mount. In
// jsdom without env vars, the real client would crash on construction.
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  }),
}));

// Parity with components/shell/PublicShell.test.tsx + SiteShell.test.tsx —
// the landing surface's top-right pill was flipped to state-aware attendee-first
// on 2026-09-06 (superseding the 2026-08-08 "Log in only" pin) to align with
// the Q32 audience-boundary rule now that /account/sign-in is the attendee door.
//
// `signedIn` is pinnable server-side (used by tests + any non-browser caller);
// omitting it renders the client island (LandingAuthPill), which reads the
// browser session on mount and starts from a signed-out first paint so the
// landing page stays a static prerender.
describe('LandingNav — state-aware attendee-first CTA (shell parity)', () => {
  it('signedIn={false} renders a "Sign in" pill pointing at the attendee door', () => {
    render(<LandingNav signedIn={false} />);
    const cta = screen.getByRole('link', { name: /^sign in$/i });
    expect(cta).toHaveAttribute('href', '/account/sign-in');
    expect(screen.queryByRole('link', { name: /^account$/i })).not.toBeInTheDocument();
  });

  it('signedIn={true} renders an "Account" pill pointing at /account', () => {
    render(<LandingNav signedIn />);
    const cta = screen.getByRole('link', { name: /^account$/i });
    expect(cta).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('top-right CTA does NOT point at /login — Q32 audience-boundary regression guard', () => {
    // The organizer /login door is still reachable from the "Start an Event"
    // pill (requireStaff() redirects an anon caller there) — but the primary
    // top-right auth CTA must be the attendee door, never staff /login.
    render(<LandingNav signedIn={false} />);
    const cta = screen.getByRole('link', { name: /^sign in$/i });
    expect(cta.getAttribute('href')).not.toBe('/login');
  });

  it('omitting `signedIn` renders the client island with a signed-out first paint', () => {
    // First paint of the client island matches the signed-out default so a
    // marketing visitor never sees a layout shift; the useEffect flip to
    // "Account" only fires if the mocked getSession returns a real session
    // (mock above returns null).
    render(<LandingNav />);
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/account/sign-in');
  });

  it('"Start an Event" pill still points at /events/new regardless of signedIn state', () => {
    // Organizer entry is unchanged by the top-right flip — the "Start an Event"
    // pill remains on both branches (requireStaff() handles the anon case).
    for (const signedIn of [false, true]) {
      cleanup();
      render(<LandingNav signedIn={signedIn} />);
      const start = screen.getByRole('link', { name: /start an event/i });
      expect(start).toHaveAttribute('href', '/events/new');
    }
  });
});
