/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BackToRegistrations } from './BackToRegistrations';

afterEach(cleanup);

describe('BackToRegistrations', () => {
  it('is one link back to the attendee home, Registrations', () => {
    render(<BackToRegistrations />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /back to my registrations/i })).toHaveAttribute('href', '/account/registrations');
  });
});
