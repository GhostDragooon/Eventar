/** @vitest-environment jsdom */
// The guest-registration banner on Registrations, Check-in and History (Ivan 2026-11-02, pick 5a): shown only for a
// positive count, singular for one, one link to the claim page.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClaimBanner } from './ClaimBanner';

afterEach(cleanup);

describe('ClaimBanner', () => {
  it('count 0: renders nothing', () => {
    const { container } = render(<ClaimBanner count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('count 1: singular sentence, one link to the claim page', () => {
    render(<ClaimBanner count={1} />);
    expect(
      screen.getByText('We found 1 registration made with your email as a guest. Link it to your account to see it here.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Link past registrations' })).toHaveAttribute('href', '/account/claim');
  });

  it('count N: plural sentence with the number', () => {
    render(<ClaimBanner count={4} />);
    expect(
      screen.getByText('We found 4 registrations made with your email as a guest. Link them to your account to see them here.'),
    ).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
