/** @vitest-environment jsdom */
import { vi } from 'vitest';

// SignOutButton imports supabase browser client which talks to env vars
// at module init. The shell test cares about layout/presence, not the
// sign-out flow itself — stub it to a button so the shell test stays focused.
vi.mock('./SignOutButton', () => ({
  SignOutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className} data-testid="sign-out-button">
      Sign Out
    </button>
  ),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StaffShell } from './StaffShell';

// vitest config has globals:false — RTL renders accumulate without explicit cleanup.
afterEach(cleanup);

const staff = { email: 'jane@company.com', role: 'organizer' as const };

describe('StaffShell — 3-part NAV bar (patterns §8)', () => {
  it('renders Eventar brand linking to /dashboard', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const brand = screen.getByRole('link', { name: 'Eventar' });
    expect(brand).toBeInTheDocument();
    expect(brand).toHaveAttribute('href', '/dashboard');
  });

  it('renders the back link when backHref + backLabel are provided', () => {
    render(
      <StaffShell staff={staff} backHref="/dashboard" backLabel="Dashboard">
        <div>page content</div>
      </StaffShell>,
    );
    const back = screen.getByRole('link', { name: /back to dashboard/i });
    expect(back).toBeInTheDocument();
    expect(back).toHaveAttribute('href', '/dashboard');
  });

  it('does NOT render a back link when backHref + backLabel are absent', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull();
  });

  it('renders the staff email in the right cluster', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByText('jane@company.com')).toBeInTheDocument();
  });

  it('renders a settings icon link to /settings with accessible label', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    const settings = screen.getByRole('link', { name: /settings/i });
    expect(settings).toHaveAttribute('href', '/settings');
  });

  it('mounts the SignOutButton', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
  });

  it('renders page children', () => {
    render(
      <StaffShell staff={staff}>
        <div>unique-child-marker</div>
      </StaffShell>,
    );
    expect(screen.getByText('unique-child-marker')).toBeInTheDocument();
  });

  it('does NOT render the removed M3 sidebar nav items (Dashboard / Attendees / Sessions / Analytics / New Event)', () => {
    // The previous shell shipped a 6-item sidebar; the 3-part bar removes it
    // entirely. None of those nav labels should appear as links in the chrome.
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('link', { name: /^attendees$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^sessions$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^analytics$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^new event$/i })).toBeNull();
    // "Dashboard" CAN appear if backLabel="Dashboard" — but with no back link
    // there should be no Dashboard link in the chrome either.
    expect(screen.queryByRole('link', { name: /^dashboard$/i })).toBeNull();
  });

  it('does NOT render the old footer ("© YEAR Eventar")', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByText(/© \d{4} Eventar/)).toBeNull();
    expect(screen.queryByText(/internal workshop manager/i)).toBeNull();
  });
});
