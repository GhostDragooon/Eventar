/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SecurityModeSwitch } from './SecurityModeSwitch';

afterEach(cleanup);

describe('SecurityModeSwitch', () => {
  it('emits the picked mode', () => {
    const onChange = vi.fn();
    render(<SecurityModeSwitch value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /restricted/i }));
    expect(onChange).toHaveBeenCalledWith('restricted');
  });

  it('shows the error as an alert when supplied', () => {
    render(<SecurityModeSwitch value={null} onChange={() => undefined} error="Pick a mode." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a mode.');
  });
});
