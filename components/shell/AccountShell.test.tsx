/** @vitest-environment jsdom */
import { vi } from 'vitest';

let mockPathname = '/account';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
const signOut = vi.fn().mockResolvedValue({});
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AccountShell } from './AccountShell';

afterEach(cleanup);
beforeEach(() => {
  mockPathname = '/account';
  signOut.mockClear();
});

const rail = () => screen.getByRole('complementary', { name: 'Your Eventar portal' });
const bar = () => screen.getByRole('navigation', { name: 'Portal' });

describe('AccountShell: portal', () => {
  it('lists the doctrine nav in order, in the rail and the phone bar', () => {
    render(<AccountShell>content</AccountShell>);
    const labels = (el: HTMLElement) => within(el).getAllByText(/^(Check-in|Registrations|Events|History|Account)$/).map((n) => n.textContent);
    const order = ['Check-in', 'Registrations', 'Events', 'History', 'Account'];
    expect(labels(rail())).toEqual(order);
    expect(labels(bar())).toEqual(order);
  });

  it('links only the pages that exist; the rest are inert, not links', () => {
    render(<AccountShell>content</AccountShell>);
    for (const scope of [rail(), bar()]) {
      expect(within(scope).getByRole('link', { name: /Events/ })).toHaveAttribute('href', '/events');
      expect(within(scope).getByRole('link', { name: /Account/ })).toHaveAttribute('href', '/account');
      for (const name of ['Check-in', 'Registrations', 'History']) {
        expect(within(scope).queryByRole('link', { name: new RegExp(name) })).toBeNull();
        expect(within(scope).getByText(name).closest('[aria-disabled="true"]')).not.toBeNull();
      }
    }
  });

  it('marks the current place: /account/record lights Account, /events lights Events', () => {
    mockPathname = '/account/record';
    const { unmount } = render(<AccountShell>content</AccountShell>);
    expect(within(rail()).getByRole('link', { name: /Account/ })).toHaveAttribute('aria-current', 'page');
    expect(within(rail()).getByRole('link', { name: /Events/ })).not.toHaveAttribute('aria-current');
    unmount();
    mockPathname = '/events';
    render(<AccountShell>content</AccountShell>);
    expect(within(rail()).getByRole('link', { name: /Events/ })).toHaveAttribute('aria-current', 'page');
    expect(within(rail()).getByRole('link', { name: /Account/ })).not.toHaveAttribute('aria-current');
  });

  it('brand links to Events, not the marketing landing', () => {
    render(<AccountShell>content</AccountShell>);
    expect(within(rail()).getByRole('link', { name: 'Eventar home' })).toHaveAttribute('href', '/events');
  });

  it('Sign out is a rail row that signs out and returns home', async () => {
    const loc = { href: '/account' };
    vi.stubGlobal('location', loc);
    render(<AccountShell>content</AccountShell>);
    fireEvent.click(within(rail()).getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(loc.href).toBe('/'));
    vi.unstubAllGlobals();
  });

  it('marks the current place in the phone bar too', () => {
    mockPathname = '/events';
    render(<AccountShell>content</AccountShell>);
    expect(within(bar()).getByRole('link', { name: /Events/ })).toHaveAttribute('aria-current', 'page');
    expect(within(bar()).getByRole('link', { name: /Account/ })).not.toHaveAttribute('aria-current');
  });

  it.each(['/eventsfoo', '/accounts', '/'])('lights nothing on %s (prefix of a name is not the place)', (path) => {
    mockPathname = path;
    render(<AccountShell>content</AccountShell>);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it('keeps Events lit on a sub-route', () => {
    mockPathname = '/events/abc';
    render(<AccountShell>content</AccountShell>);
    expect(within(rail()).getByRole('link', { name: /Events/ })).toHaveAttribute('aria-current', 'page');
  });

  it('marks the current phone tab with a rule that is not colour, on that tab only', () => {
    mockPathname = '/events';
    render(<AccountShell>content</AccountShell>);
    const rules = bar().querySelectorAll('[data-current-rule]');
    expect(rules).toHaveLength(1);
    expect(rules[0].closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('prints Soon under each unbuilt phone tab, not only in a hover title', () => {
    render(<AccountShell>content</AccountShell>);
    expect(within(bar()).getAllByText('Soon')).toHaveLength(3);
  });

  it('tells assistive tech and touch users the three unbuilt tabs are coming soon', () => {
    render(<AccountShell>content</AccountShell>);
    for (const name of ['Check-in', 'Registrations', 'History']) {
      const tab = within(bar()).getByText(name).closest('[aria-disabled="true"]') as HTMLElement;
      expect(tab).toHaveAttribute('title', `${name} is coming soon`);
      expect(within(tab).getByText(/coming soon/i)).toBeTruthy();
    }
  });

  it('has a skip link and a main landmark holding the page', () => {
    render(<AccountShell>page content</AccountShell>);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(within(screen.getByRole('main')).getByText('page content')).toBeTruthy();
  });
});

describe('AccountShell: onboarding', () => {
  it('has no portal nav: brand, email and Sign out only', () => {
    mockPathname = '/account/complete';
    render(
      <AccountShell variant="onboarding" email="uma@sample.test">
        wizard
      </AccountShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Portal' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Registrations')).toBeNull();
    // Shown in the bar from sm up and under it on phones (a wrong-address sign-in must be visible at 375 px).
    expect(screen.getAllByText(/uma@sample\.test/)).toHaveLength(2);
    // The mark is not a link: a link to /account/complete would drop the wizard's ?next=.
    expect(screen.queryByRole('link', { name: 'Eventar home' })).toBeNull();
    expect(within(screen.getByRole('banner')).getByText('Eventar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
