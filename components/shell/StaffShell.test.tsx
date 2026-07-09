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

describe('StaffShell — section-tab NAV (Design Session Log)', () => {
  it('renders the four section tabs with their routes', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('href', '/checkin');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
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

  it('does NOT render an Eventar wordmark in the nav (brand lives in the footer)', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.queryByRole('link', { name: 'Eventar' })).toBeNull();
  });

  it('renders the "By Eventar" footer band', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByText(/^By$/)).toBeInTheDocument();
    expect(screen.getByText('Eventar')).toBeInTheDocument();
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

  it('renders the staff email + settings link in the right cluster', () => {
    render(
      <StaffShell staff={staff}>
        <div>page content</div>
      </StaffShell>,
    );
    expect(screen.getByText('jane@company.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
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
