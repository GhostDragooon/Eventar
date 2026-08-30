/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title, description, and an optional action', () => {
    render(<EmptyState title="No events yet" description="Create your first event." action={<button type="button">Create event</button>} />);
    expect(screen.getByRole('heading', { name: 'No events yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeInTheDocument();
  });
});
