/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToggleCountButton } from './ToggleCountButton';

afterEach(cleanup);

describe('ToggleCountButton', () => {
  it('toggles pressed state and shows the count', () => {
    const onChange = vi.fn();
    render(<ToggleCountButton label="Bookmarked" pressed={false} count={3} onChange={onChange} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('3');
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
