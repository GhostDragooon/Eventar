/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExpandablePlanPicker } from './ExpandablePlanPicker';

afterEach(cleanup);

const tiers = [
  { id: 'starter', name: 'Starter', description: 'For individuals', monthlyLabel: '$0/mo', annualLabel: '$0/yr', features: ['One seat'] },
];

describe('ExpandablePlanPicker', () => {
  it('keeps Continue disabled until a tier is selected', () => {
    render(<ExpandablePlanPicker tiers={tiers} billing="monthly" value={null} onChange={() => undefined} onContinue={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('selects a tier and calls onContinue', () => {
    const onChange = vi.fn();
    const onContinue = vi.fn();
    render(<ExpandablePlanPicker tiers={tiers} billing="monthly" value="starter" onChange={onChange} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: /starter/i }));
    expect(onChange).toHaveBeenCalledWith('starter');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
