/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NumericStepper } from './NumericStepper';

afterEach(cleanup);

describe('NumericStepper', () => {
  it('enforces stepper boundaries', () => {
    const onChange = vi.fn();
    render(<NumericStepper label="Seats" value={1} min={1} max={2} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /decrease seats/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /increase seats/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables Increase at the max', () => {
    render(<NumericStepper label="Seats" value={2} min={1} max={2} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /increase seats/i })).toBeDisabled();
  });
});
