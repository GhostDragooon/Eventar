/** @vitest-environment jsdom */
import { vi } from 'vitest';

// The shell derives the active tab from the current route.
let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StaffShell } from './StaffShell';

// vitest config has globals:false — RTL renders accumulate without explicit cleanup.
afterEach(cleanup);
beforeEach(() => {
  mockPathname = '/dashboard';
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
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('href', '/checkin');
    // Labelled "Reports" per the IA spec's area 7 ("Reports / Analytics") and
    // the mockup sidebar; the ROUTE it must reach is still /analytics.
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/analytics');
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

  it('marks the current section with aria-current', () => {
    mockPathname = '/checkin';
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('renders the Eventar brand mark at the top of the sidebar', () => {
    // REVERSES the old "no wordmark in shell chrome" rule. Ivan's call
    // 2026-08-09, taken explicitly after being shown that the organiser IA
    // mockups put the mark in the sidebar and the older rule forbade it.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: /eventar home/i })).toHaveAttribute('href', '/');
  });

  it('shows every IA area, with unbuilt ones inert rather than linking to 404s', () => {
    // docs/plans/2026-07-12-organiser-ia-spec.md lists 8 areas; 7 render (Events
    // was removed 2026-08-09 — /dashboard already IS the events list) and four
    // of those have routes. The unbuilt ones must be VISIBLE (so the shell shows
    // the real IA) and NOT links (so nothing navigates into a 404).
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    for (const label of ['Participants', 'Accreditation', 'Communications']) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: new RegExp(label, 'i') })).toBeNull();
    }
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
      <StaffShell staff={staff} backHref="/dashboard" backLabel="Dashboard">
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('does NOT render a back link when backHref + backLabel are absent', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull();
  });

  it('shows the staff email in the top bar and Settings in the sidebar', () => {
    // M2 Stage 2: the sidebar owns navigation, so Settings lives there and the
    // top bar carries identity only. getByRole (not queryAll) also pins that
    // there is exactly ONE link to /settings — a second one up top made the
    // accessible name ambiguous and is the reason the gear icon was removed.
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

  it('renders page children', () => {
    render(
      <StaffShell staff={staff}>
        <div>unique-child-marker</div>
      </StaffShell>,
    );
    expect(screen.getByText('unique-child-marker')).toBeInTheDocument();
  });
});
