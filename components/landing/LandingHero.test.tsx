/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LandingHero } from './LandingHero';

afterEach(cleanup);

// Two audiences, one shape (spec 001 FR-001): practitioner mode offers the pair
// "Get started" (sign-up) and "Log in" (sign-in), mirroring the organiser pair,
// which is deliberately unchanged. This reverses the 2026-09-25 single-CTA
// ("Get started" -> /events) shape of e6c2dc0; the lock below fails loudly if a
// future edit collapses the practitioner pair again or drops the organiser pair.
describe('LandingHero — audience CTAs', () => {
  it('practitioner view renders the pair: "Get started" -> /account/sign-up and "Log in" -> /account/sign-in', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} />);
    const ctas = screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'));
    expect(ctas).toHaveLength(2);
    expect(ctas[0]).toHaveAccessibleName('Get started');
    expect(ctas[0]).toHaveAttribute('href', '/account/sign-up');
    expect(ctas[1]).toHaveAccessibleName('Log in');
    expect(ctas[1]).toHaveAttribute('href', '/account/sign-in');
  });

  it('practitioner CTAs never point at the organiser door or the workspace (Q32)', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} />);
    for (const a of screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'))) {
      expect(a.getAttribute('href')).not.toMatch(/^\/(login|dashboard)/);
    }
  });

  it('organiser view renders both CTAs unchanged: "Start an Event" and "Organiser log in"', () => {
    render(<LandingHero audience="organiser" onAudienceChange={vi.fn()} />);
    const start = screen.getByRole('link', { name: /^start an event$/i });
    expect(start).toHaveAttribute('href', '/login?next=/events/new');
    const login = screen.getByRole('link', { name: /^organiser log in$/i });
    expect(login).toHaveAttribute('href', '/login');
  });

  it('switching audience swaps the CTA set (toggle click calls onAudienceChange)', () => {
    const onAudienceChange = vi.fn();
    render(<LandingHero audience="practitioner" onAudienceChange={onAudienceChange} />);
    screen.getByRole('tab', { name: /organiser/i }).click();
    expect(onAudienceChange).toHaveBeenCalledWith('organiser');
  });
});
