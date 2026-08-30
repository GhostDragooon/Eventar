/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import NotFound from './not-found';

afterEach(cleanup);

describe('NotFound', () => {
  it('renders recovery links to events and home', () => {
    render(<NotFound />);
    // SiteShell's footer nav also links to /events, so scope to the page body.
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: /upcoming events/i })).toHaveAttribute('href', '/events');
    expect(main.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });
});
