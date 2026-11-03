/** @vitest-environment jsdom */
// The "account setup is not finished" banner on Registrations and Check-in (Ivan 2026-11-04, Decide 1): the wizard
// can be finished without a licence, so this is where a practitioner without one sees what is still missing.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LicenceBanner } from './LicenceBanner';

afterEach(cleanup);

describe('LicenceBanner', () => {
  it('a licence is declared: renders nothing', () => {
    const { container } = render(<LicenceBanner missing={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('no licence: says what is unfinished and why it matters, with one link to the profile', () => {
    render(<LicenceBanner missing />);
    expect(
      screen.getByText(
        'Account setup is not finished: no licence is declared. Credit is released only once you declare one.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Add a licence' })).toHaveAttribute('href', '/account/profile');
  });
});
