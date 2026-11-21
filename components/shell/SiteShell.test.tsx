/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SiteShell } from './SiteShell';

afterEach(cleanup);

describe('SiteShell — state-aware right-side CTA', () => {
  it('signed-out renders a "Log in" pill pointing at the attendee door', () => {
    render(
      <SiteShell>
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('link', { name: /^log in$/i });
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
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
  });

  it('the Log in CTA does NOT point at /login, and the nav has no other /login link', () => {
    // Q32 audience boundary, as amended by Doctrine 2026-10-30 section 1 (two doors, both reachable, each labelled):
    // the plain CTA is the attendee door. The organiser door is a separate link that says so. This still guards a
    // "one Log in for everyone" regression that would put a signed-out attendee on the wrong door.
    render(
      <SiteShell>
        <div>content</div>
      </SiteShell>,
    );
    expect(screen.getByRole('link', { name: /^log in$/i })).not.toHaveAttribute('href', '/login');
    const toLogin = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/login');
    expect(toLogin).toEqual([]);
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
      <SiteShell>
        <div>content</div>
      </SiteShell>,
    );
    expect(screen.getByRole('link', { name: /^log in$/i })).toBeInTheDocument();
  });

  // M1 (2026-09-25): /login is the organiser door but used to pass
  // active="signin", which tints the pill that points at the practitioner
  // door. Pages that belong to no nav item now omit `active`.
  it('`active` is optional: nothing is marked as the current page without it', () => {
    render(
      <SiteShell>
        <div>content</div>
      </SiteShell>,
    );
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /^log in$/i })).not.toHaveAttribute('aria-current');
  });

  it('signed-in + isStaff renders the StaffProgrammePill (Events link to /dashboard), NOT the attendee AccountMenu', () => {
    // Ivan 2026-09-24: organisers have no attendee identity — attendee
    // shells suppress the AccountMenu and render an escape hatch back to
    // /dashboard when the session is staff.
    render(
      <SiteShell active="account" signedIn isStaff>
        <div>content</div>
      </SiteShell>,
    );
    const events = screen.getByRole('link', { name: /^events$/i });
    expect(events).toHaveAttribute('href', '/dashboard');
    // Attendee Account menu MUST NOT render for a staff session.
    expect(screen.queryByRole('button', { name: /^account$/i })).not.toBeInTheDocument();
    // Sign-in pill MUST NOT render either — this is a signed-in state.
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
  });
});

// Ivan 2026-11-22: attendee and organiser paths are separated by the landing pill. The nav has no organiser door
// (this reverses Doctrine 2026-10-30 section 1, which wanted it on every public page).
describe('SiteShell: no organiser door in the nav', () => {
  it('shows no organiser link to /login for a signed-out visitor', () => {
    render(<SiteShell active="events">content</SiteShell>);
    expect(screen.queryByRole('link', { name: /organisers?/i })).not.toBeInTheDocument();
  });

  it('does not show it to a signed-in attendee', () => {
    render(<SiteShell active="events" signedIn accountComplete>content</SiteShell>);
    expect(screen.queryByRole('link', { name: /organisers? log in/i })).not.toBeInTheDocument();
  });

  it('loginHref redirects the Log in pill and drops the separate organiser link (the pill is that door)', () => {
    render(<SiteShell loginHref="/login?next=%2Finvite%2Fabc">content</SiteShell>);
    expect(screen.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login?next=%2Finvite%2Fabc');
    expect(screen.queryByRole('link', { name: /organisers? log in/i })).not.toBeInTheDocument();
  });
});

describe('SiteShell: brand link', () => {
  it('goes to /events for a signed-in attendee, / for a visitor and for staff', () => {
    // Two links: the phone logo strip and the in-pill mark (CSS shows one per breakpoint; jsdom has no CSS).
    const brand = () => screen.getAllByRole('link', { name: 'Eventar home' }).map((a) => a.getAttribute('href'));
    const { unmount } = render(<SiteShell signedIn accountComplete>content</SiteShell>);
    expect(brand()).toEqual(['/events', '/events']);
    unmount();
    const second = render(<SiteShell>content</SiteShell>);
    expect(brand()).toEqual(['/', '/']);
    second.unmount();
    render(<SiteShell signedIn isStaff>content</SiteShell>);
    expect(brand()).toEqual(['/', '/']);
  });
});

describe('SiteShell: nav items', () => {
  it('has no "Home" link; the brand mark is home', () => {
    render(<SiteShell>content</SiteShell>);
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Eventar home' }).map((a) => a.getAttribute('href'))).toEqual(['/', '/']);
  });

  it.each([
    ['events', 'Upcoming events'],
    ['signin', 'Log in'],
  ] as const)('the %s item that points at this page is a non-link with aria-current', (active, label) => {
    render(<SiteShell active={active}>content</SiteShell>);
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.tagName).toBe('SPAN');
    expect(current?.textContent).toContain(label);
    // The footer repeats some labels; only the primary nav must not link to its own page.
    expect(within(nav).queryByRole('link', { name: new RegExp(label === 'Log in' ? '^log in$' : label, 'i') })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Eventar home' })).toHaveLength(2);
  });
});
