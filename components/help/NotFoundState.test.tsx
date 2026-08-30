/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NotFoundState } from './NotFoundState';

afterEach(cleanup);

describe('NotFoundState', () => {
  it('renders each recovery action as a link', () => {
    render(
      <NotFoundState
        title="Course not found"
        actions={[
          { label: 'Browse courses', href: '/events', primary: true },
          { label: 'Home', href: '/' },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Course not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse courses' })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });
});
