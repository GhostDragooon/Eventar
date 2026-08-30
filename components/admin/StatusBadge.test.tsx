/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders each status with the correct semantic tone', () => {
    const { rerender } = render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toHaveClass('bg-success-container');
    rerender(<StatusBadge status="restricted" />);
    expect(screen.getByText('restricted')).toHaveClass('bg-error-container');
  });
});
