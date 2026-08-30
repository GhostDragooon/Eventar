/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BillingPeriodToggle } from './BillingPeriodToggle';

afterEach(cleanup);

describe('BillingPeriodToggle', () => {
  it('marks the active period pressed and calls onChange for the other', () => {
    const onChange = vi.fn();
    render(<BillingPeriodToggle value="monthly" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'monthly' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'annual' }));
    expect(onChange).toHaveBeenCalledWith('annual');
  });
});
