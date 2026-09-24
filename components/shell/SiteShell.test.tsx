/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SiteShell } from './SiteShell';

afterEach(cleanup);

describe('SiteShell — state-aware right-side CTA', () => {
  it('signed-out renders a "Sign in" pill pointing at the attendee door', () => {
    render(
      <SiteShell active="home">
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('link', { name: /^sign in$/i });
    expect(cta).toHaveAttribute('href', '/account/sign-in');
    expect(screen.queryByRole('link', { name: /^account$/i })).not.toBeInTheDocument();
  });

  it('signed-in renders an "Account" menu trigger, not a plain link', () => {
    // 2026-09-21: the signed-in CTA became a disclosure menu (AccountMenu)
    // instead of a link straight to /account — it opens a menu whose items
    // include /account, rather than navigating there itself.
    render(
      <SiteShell active="account" signedIn>
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('button', { name: /^account$/i });
    expect(cta).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('CTA does NOT point at /login — the staff door is unlinked from the public chrome', () => {
    // Q32 audience boundary: the shell's outbound CTA is for attendees.
    // Staff /login stays reachable via direct URL. This test guards against
    // a future "one Log in for everyone" regression that would put a
    // signed-out attendee on the wrong door.
    render(
      <SiteShell active="home">
        <div>content</div>
      </SiteShell>,
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/login');
  });

  it('signed-in Account menu trigger marks itself active via aria-current when active="account"', () => {
    render(
      <SiteShell active="account" signedIn>
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('button', { name: /^account$/i });
    expect(cta).toHaveAttribute('aria-current', 'page');
  });

  it('defaults to signed-out when `signedIn` prop is omitted (safe default for client-component callers)', () => {
    render(
      <SiteShell active="home">
        <div>content</div>
      </SiteShell>,
    );
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('signed-in + isStaff renders the StaffProgrammePill (Programme link to /dashboard), NOT the attendee AccountMenu', () => {
    // Ivan 2026-09-24: organisers have no attendee identity — attendee
    // shells suppress the AccountMenu and render an escape hatch back to
    // /dashboard when the session is staff.
    render(
      <SiteShell active="account" signedIn isStaff>
        <div>content</div>
      </SiteShell>,
    );
    const programme = screen.getByRole('link', { name: /^programme$/i });
    expect(programme).toHaveAttribute('href', '/dashboard');
    // Attendee Account menu MUST NOT render for a staff session.
    expect(screen.queryByRole('button', { name: /^account$/i })).not.toBeInTheDocument();
    // Sign-in pill MUST NOT render either — this is a signed-in state.
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });
});
