/** @vitest-environment jsdom */
import { vi } from 'vitest';

// The shell derives the active tab from the current route.
let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));
// signOutAndLeave (lib/signOut.ts) goes through the browser client; the revoke result is the test's to set.
const signOut = vi.fn().mockResolvedValue({});
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StaffShell } from './StaffShell';

// vitest config has globals:false — RTL renders accumulate without explicit cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  mockPathname = '/dashboard';
  signOut.mockClear();
});

const staff = { email: 'jane@company.com', role: 'organiser_member' as const };

// The 248px sidebar was replaced by a floating glass pill nav on 2026-08-08.
// These assertions are role/href-based, so they survived the rewrite unchanged
// — which is why they are worth keeping: they pin the shell's CONTRACT (which
// routes exist, which is current, where the brand lives) rather than its layout.
describe('StaffShell — primary navigation', () => {
  it('renders the staff sections with their routes', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('href', '/checkin');
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/dashboard');
    // History is the /analytics data (what we ran); Doctrine 2026-10-30.
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('does NOT link to /events — that route ejects the user out of the shell', () => {
    // Regression guard. /events is app/(public)/events, a SiteShell page: from
    // the staff sidebar it loaded the public listing and the sidebar vanished,
    // which reads as the app breaking. /dashboard is the staff events list.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/events');
  });

  it('does NOT link to /login — the staff shell is already inside the organizer door', () => {
    // Q32 audience boundary, StaffShell side: parity with SiteShell/PublicShell/
    // LandingNav's no-/login guards. A signed-in organizer inside the shell has
    // no reason to ever see the organizer sign-in door as a nav destination.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/login');
  });

  it('marks the current section with aria-current', () => {
    mockPathname = '/checkin';
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Events' })).not.toHaveAttribute('aria-current');
  });

  it('renders the Eventar brand mark at the top of the sidebar, pointing at /dashboard', () => {
    // REVERSES the old "no wordmark in shell chrome" rule. Ivan's call
    // 2026-08-09, taken explicitly after being shown that the organiser IA
    // mockups put the mark in the sidebar and the older rule forbade it.
    // href is /dashboard, not "/" — BrandMark's own docblock specifies this
    // for the staff shell; "/" ejected the organiser to the marketing site.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: /eventar home/i })).toHaveAttribute('href', '/dashboard');
  });

  it('has exactly four sidebar items and none of the retired ones (Doctrine 2026-10-30)', () => {
    // Check-in, Events, History, Settings. Programme and Manage became one Events home; Participants, Accreditation,
    // Communications and Reports are not top-level organiser destinations.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/checkin', '/dashboard', '/analytics', '/settings']);
    for (const retired of ['Programme', 'Manage', 'Participants', 'Accreditation', 'Communications', 'Reports']) {
      expect(screen.queryByText(retired)).toBeNull();
    }
  });

  it('lights History on a single event\'s analytics page and Settings on its sub-pages', () => {
    mockPathname = '/events/abc/analytics';
    const { unmount } = render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    unmount();
    mockPathname = '/settings/team';
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts the Eventar wordmark in the footer, inside a contentinfo landmark', () => {
    // The behaviour this guards (paired with the no-wordmark-in-nav test above)
    // is WHERE the brand lives, not how the old band split its text nodes. It
    // used to assert /^By$/ against `By <span>Eventar</span>`; the shared
    // SiteFooter reads "By Eventar · CPD infrastructure, Hong Kong", so that
    // assertion was pinning markup, not behaviour.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Eventar');
  });

  it('does not render marketing anchors in the staff footer', () => {
    // Regression guard: SiteFooter's default renders landing anchors. From a
    // staff route `/#how-it-works` leaves the app, so StaffShell passes
    // links={false}. This is the same "link that goes nowhere useful" class the
    // 2026-08-08 nav pass existed to remove.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Footer' })).toBeNull();
  });

  it('renders the back link when backHref + backLabel are provided', () => {
    render(
      <StaffShell staff={staff} backHref="/dashboard" backLabel="Events">
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: /back to events/i })).toHaveAttribute('href', '/dashboard');
  });

  it('does NOT render a back link when backHref + backLabel are absent', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull();
  });

  it('shows the staff email in the sidebar account chip and Settings in the nav', () => {
    // M2 Stage 2 put Settings in the sidebar; the 2026-09-07 pass removed the
    // top bar entirely and moved identity into the sidebar's account chip.
    // getByRole (not queryAll) also pins that there is exactly ONE link to
    // /settings — a second one up top made the accessible name ambiguous and
    // is the reason the gear icon was removed.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByText('jane@company.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('marks Settings active when on /settings, so the sidebar is never blank', () => {
    // Regression guard: /settings is not one of the four sections, so before
    // Settings was added to the sidebar NO nav item was active on that page
    // and the nav read as broken.
    mockPathname = '/settings';
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page');
  });

  it('pins the account chip to the bottom of the sidebar (2026-09-07 top-bar removal)', () => {
    render(
      <StaffShell staff={{ ...staff, full_name: 'Jane Doe' }}>
        <div>page content</div>
      </StaffShell>,
    );
    const aside = screen.getByRole('link', { name: 'Events' }).closest('aside')!;
    // The chip is the last child of the sidebar's flex column, so it always
    // sits at the foot regardless of how many nav rows render above it.
    const flexColumn = aside.firstElementChild!;
    expect(flexColumn.lastElementChild).toHaveTextContent('jane@company.com');
    expect(flexColumn.lastElementChild).toHaveTextContent('Jane'); // first-name display
    expect(within(flexColumn.lastElementChild as HTMLElement).getByText('JA')).toBeInTheDocument();
  });

  it('renders page children', () => {
    render(
      <StaffShell staff={staff}>
        <div>unique-child-marker</div>
      </StaffShell>,
    );
    expect(screen.getByText('unique-child-marker')).toBeInTheDocument();
  });
});

// No-silence area 6 (pick 6b): the chip says who and in what role, and does not pretend to be a control; Sign out is
// a quiet row under the nav, the one sign-out of lib/signOut.ts.
describe('StaffShell — account chip and Sign out', () => {
  const sidebar = () => screen.getByRole('navigation', { name: 'Primary' }).closest('aside')!;
  const chip = () => (sidebar().firstElementChild as HTMLElement).lastElementChild as HTMLElement;

  it.each([
    ['organiser_admin', 'Organiser Admin'],
    ['organiser_member', 'Organiser'],
    ['body_admin', 'Body Admin'],
    ['auditor', 'Auditor'],
    ['eventar_staff', 'Eventar Staff'],
  ] as const)('prints the role line for %s as "%s"', (role, label) => {
    render(<StaffShell staff={{ email: 'jane@company.com', role }}>content</StaffShell>);
    expect(within(chip()).getByText(label)).toBeInTheDocument();
  });

  it('does not look clickable: no pointer cursor, no hover fill, no handler role', () => {
    render(<StaffShell staff={staff}>content</StaffShell>);
    expect(chip().className).not.toMatch(/cursor-pointer/);
    expect(chip().className).not.toMatch(/hover:/);
    expect(within(chip()).queryByRole('button')).toBeNull();
    expect(within(chip()).queryByRole('link')).toBeNull();
  });

  it('Sign out is a button in the sidebar, not a link, and the nav links are unchanged', () => {
    render(<StaffShell staff={staff}>content</StaffShell>);
    expect(within(sidebar()).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign out' })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('button')).toBeNull();
  });

  it('Sign out signs out and leaves for /login', async () => {
    const loc = { href: '/dashboard' };
    vi.stubGlobal('location', loc);
    render(<StaffShell staff={staff}>content</StaffShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(loc.href).toBe('/login'));
  });

  it('while the revoke is in flight the row is disabled and says so (no double submit)', async () => {
    vi.stubGlobal('location', { href: '/dashboard' });
    let release!: (v: unknown) => void;
    signOut.mockReturnValueOnce(new Promise((r) => { release = r; }));
    render(<StaffShell staff={staff}>content</StaffShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Signing out…' })).toBeDisabled();
    release({});
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
  });

  it('a failed sign-out says so, does not navigate, and a retry can succeed', async () => {
    const loc = { href: '/dashboard' };
    vi.stubGlobal('location', loc);
    signOut.mockResolvedValueOnce({ error: { message: 'network' } });
    render(<StaffShell staff={staff}>content</StaffShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out. Try again.');
    expect(loc.href).toBe('/dashboard');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(loc.href).toBe('/login'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
