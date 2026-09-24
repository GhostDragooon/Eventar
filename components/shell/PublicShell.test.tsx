/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PublicShell } from './PublicShell';

afterEach(cleanup);

describe('PublicShell — state-aware right-side CTA (SiteShell parity)', () => {
  it('signed-out renders a "Sign in" pill pointing at the attendee door', () => {
    render(
      <PublicShell>
        <div>content</div>
      </PublicShell>,
    );
    const cta = screen.getByRole('link', { name: /^sign in$/i });
    expect(cta).toHaveAttribute('href', '/account/sign-in');
    expect(screen.queryByRole('link', { name: /^account$/i })).not.toBeInTheDocument();
  });

  it('signed-in renders an "Account" menu trigger, not a plain link', () => {
    // 2026-09-21: the signed-in CTA became a disclosure menu (AccountMenu)
    // instead of a link straight to /account — SiteShell parity.
    render(
      <PublicShell signedIn>
        <div>content</div>
      </PublicShell>,
    );
    const cta = screen.getByRole('button', { name: /^account$/i });
    expect(cta).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('CTA does NOT point at /login — the staff door is unlinked from the public chrome (Q32 audience boundary)', () => {
    // Mirror of the SiteShell regression guard. This shell is attendee-facing
    // (event pages, check-in pass, survey), so a signed-out visitor's CTA must
    // route to the attendee door, never the staff /login.
    render(
      <PublicShell>
        <div>content</div>
      </PublicShell>,
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/login');
  });

  it('defaults to signed-out when `signedIn` prop is omitted', () => {
    render(
      <PublicShell>
        <div>content</div>
      </PublicShell>,
    );
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('signed-in + isStaff renders StaffProgrammePill (Programme -> /dashboard), NOT the AccountMenu', () => {
    // Ivan 2026-09-24: organisers have no attendee identity on PublicShell —
    // suppress attendee chrome, give them a route back to /dashboard.
    render(
      <PublicShell signedIn isStaff>
        <div>content</div>
      </PublicShell>,
    );
    const programme = screen.getByRole('link', { name: /^programme$/i });
    expect(programme).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button', { name: /^account$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('renders a state pill alongside the CTA when `pill` is passed (does not replace the CTA)', () => {
    // The check-in confirm page passes pill={{label:'Checked in'|'Pass ready'}}
    // to give the shell a status indicator. Before 2026-09-05 this replaced
    // the (nonexistent) auth CTA; now both must render together.
    render(
      <PublicShell pill={{ label: 'Pass ready', tone: 'success' }} signedIn>
        <div>content</div>
      </PublicShell>,
    );
    expect(screen.getByText(/pass ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^account$/i })).toBeInTheDocument();
  });

  it('still renders "Upcoming events" link in the nav', () => {
    render(
      <PublicShell>
        <div>content</div>
      </PublicShell>,
    );
    // SiteFooter also renders an "Upcoming events" link; scope to the primary
    // nav to disambiguate.
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const events = Array.from(nav.querySelectorAll('a')).find((a) => /upcoming events/i.test(a.textContent || ''));
    expect(events).toBeTruthy();
    expect(events!.getAttribute('href')).toBe('/events');
  });
});
