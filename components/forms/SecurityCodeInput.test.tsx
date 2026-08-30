/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SecurityCodeInput } from './SecurityCodeInput';

afterEach(cleanup);

describe('SecurityCodeInput', () => {
  it('normalises security code to digits and length', () => {
    const onChange = vi.fn();
    render(<SecurityCodeInput label="Code" value="" onChange={onChange} length={4} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1a2345' } });
    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('toggles between masked and revealed', () => {
    render(<SecurityCodeInput label="Code" value="1234" onChange={() => undefined} />);
    const field = screen.getByLabelText('Code');
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(field).toHaveAttribute('type', 'text');
  });
});
