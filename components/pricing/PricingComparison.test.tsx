/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PricingComparison } from './PricingComparison';

afterEach(cleanup);

const tiers = [
  { id: 'starter', name: 'Starter', description: 'For individuals', monthlyLabel: '$0/mo', annualLabel: '$0/yr', features: ['One seat'] },
];

describe('PricingComparison', () => {
  it('shows the label for the active billing period and calls onChoose', () => {
    const onChoose = vi.fn();
    render(<PricingComparison tiers={tiers} billing="annual" onChoose={onChoose} />);
    expect(screen.getByText('$0/yr')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Starter' }));
    expect(onChoose).toHaveBeenCalledWith('starter');
  });
});
