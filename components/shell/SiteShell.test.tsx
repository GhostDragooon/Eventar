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

  it('signed-in renders an "Account" pill pointing at /account', () => {
    render(
      <SiteShell active="account" signedIn>
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('link', { name: /^account$/i });
    expect(cta).toHaveAttribute('href', '/account');
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

  it('signed-in Account pill marks itself active via aria-current when active="account"', () => {
    render(
      <SiteShell active="account" signedIn>
        <div>content</div>
      </SiteShell>,
    );
    const cta = screen.getByRole('link', { name: /^account$/i });
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
});
