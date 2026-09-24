/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountMenu } from './AccountMenu';

afterEach(cleanup);

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { signOut: async () => ({ error: null }) },
  }),
}));

describe('AccountMenu', () => {
  it('renders closed by default, trigger carries aria-haspopup', () => {
    render(<AccountMenu complete />);
    const trigger = screen.getByRole('button', { name: /^account$/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('click opens the menu with the full item set for a complete account', () => {
    render(<AccountMenu complete />);
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /my record/i })).toHaveAttribute('href', '/account/record');
    expect(screen.getByRole('menuitem', { name: /profile & memberships/i })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('menuitem', { name: /account settings/i })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /claim past events/i })).not.toBeInTheDocument();
  });

  it('shows "Claim past events" only when unlinkedCount > 0', () => {
    render(<AccountMenu complete unlinkedCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    expect(screen.getByRole('menuitem', { name: /claim past events/i })).toHaveAttribute('href', '/account/claim');
  });

  it('an incomplete account only shows Account settings + Sign out — no My record, Profile, or Claim', () => {
    // Ivan's call, 2026-09-21 AskUserQuestion: hide items that would just
    // bounce to /account/complete rather than show-then-redirect.
    render(<AccountMenu complete={false} unlinkedCount={5} />);
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    expect(screen.getByRole('menuitem', { name: /account settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /my record/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /profile & memberships/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /claim past events/i })).not.toBeInTheDocument();
  });

  it('Escape closes the open menu', () => {
    render(<AccountMenu complete />);
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a click outside the menu closes it', () => {
    render(
      <div>
        <AccountMenu complete />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: /outside/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clicking a menu item closes the menu', () => {
    render(<AccountMenu complete />);
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /account settings/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('active prop marks the trigger aria-current="page"', () => {
    render(<AccountMenu complete active />);
    expect(screen.getByRole('button', { name: /^account$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('active omitted leaves aria-current unset', () => {
    render(<AccountMenu complete />);
    expect(screen.getByRole('button', { name: /^account$/i })).not.toHaveAttribute('aria-current');
  });
});
