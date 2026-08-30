/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlanSelectionCards } from './PlanSelectionCards';

afterEach(cleanup);

const plans = [
  { id: 'basic', name: 'Basic', description: 'Starter tier', priceLabel: '$0' },
  { id: 'pro', name: 'Pro', description: 'Growth tier', priceLabel: '$0', badge: 'Popular' },
];

describe('PlanSelectionCards', () => {
  it('marks the selected plan and calls onChange for another', () => {
    const onChange = vi.fn();
    render(<PlanSelectionCards plans={plans} value="basic" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /basic/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /pro/i }));
    expect(onChange).toHaveBeenCalledWith('pro');
  });
});
