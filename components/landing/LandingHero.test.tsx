/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LandingHero } from './LandingHero';

afterEach(cleanup);

// One button, one page (Ivan 2026-11-21): Log in lives in the nav pill, which follows
// this toggle, so the hero repeats no login. Practitioners keep "Sign up" (a page the
// pill does not open); organisers have no page besides /login, so their hero has none.
describe('LandingHero — audience CTAs', () => {
  it('practitioner view renders one CTA: "Sign up" -> /account/sign-up, no login', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} />);
    const ctas = screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'));
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toHaveAccessibleName('Sign up');
    expect(ctas[0]).toHaveAttribute('href', '/account/sign-up');
  });

  it('practitioner CTAs never point at the organiser door or the workspace (Q32)', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} />);
    for (const a of screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'))) {
      expect(a.getAttribute('href')).not.toMatch(/^\/(login|dashboard)/);
    }
  });

  it('organiser view has one hero button, Talk to sales; the nav pill stays the only door to /login', () => {
    render(<LandingHero audience="organiser" onAudienceChange={vi.fn()} />);
    const links = screen.queryAllByRole('link').filter((el) => el.closest('.hero-copy'));
    expect(links.map((l) => l.textContent)).toEqual(['Talk to sales']);
    expect(links[0].getAttribute('href')).not.toBe('/login');
  });

  it('switching audience swaps the CTA set (toggle click calls onAudienceChange)', () => {
    const onAudienceChange = vi.fn();
    render(<LandingHero audience="practitioner" onAudienceChange={onAudienceChange} />);
    screen.getByRole('tab', { name: /organiser/i }).click();
    expect(onAudienceChange).toHaveBeenCalledWith('organiser');
  });

  // UX-R6: a signed-in visitor is not asked to sign up. They get the one attendee page they can use.
  it('signed-in practitioner view offers "Find events" -> /events instead of Sign up', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} signedIn />);
    const ctas = screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'));
    expect(ctas.map((l) => l.textContent)).toEqual(['Find events']);
    expect(ctas[0]).toHaveAttribute('href', '/events');
  });
});
