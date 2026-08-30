/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MultiSelectCombobox } from './MultiSelectCombobox';

afterEach(cleanup);

const options = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];

describe('MultiSelectCombobox', () => {
  it('filters options by the search query', () => {
    render(<MultiSelectCombobox label="Pick" options={options} selected={[]} onChange={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bet' } });
    expect(screen.queryByRole('option', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
  });

  it('adds a selection via the option and removes it via the chip', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MultiSelectCombobox label="Pick" options={options} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['a']);

    rerender(<MultiSelectCombobox label="Pick" options={options} selected={['a']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /remove alpha/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
