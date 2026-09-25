/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LandingHero } from './LandingHero';

afterEach(cleanup);

// Regression guard for the 2026-09-25 practitioner CTA reversal (e6c2dc0):
// practitioner drops to a single "Get started" CTA (browsing is ungated;
// account creation happens at register/claim/walk-in, never as the
// marketing primary), while the organiser pair is deliberately unchanged
// (CTA-count asymmetry is intentional, not a bug) — see LandingHero.tsx's
// COPY comment. Nothing here asserts that the asymmetry itself should
// change; it locks in the two shapes so a future edit that collapses them
// back together (or drops the organiser pair) fails loudly.
describe('LandingHero — audience CTAs', () => {
  it('practitioner view renders exactly one CTA: "Get started" -> /events', () => {
    render(<LandingHero audience="practitioner" onAudienceChange={vi.fn()} />);
    const ctas = screen.getAllByRole('link').filter((el) => el.closest('.hero-copy'));
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toHaveAccessibleName('Get started');
    expect(ctas[0]).toHaveAttribute('href', '/events');
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
