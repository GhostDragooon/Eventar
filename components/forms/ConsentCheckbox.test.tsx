/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConsentCheckbox } from './ConsentCheckbox';

afterEach(cleanup);

describe('ConsentCheckbox', () => {
  it('toggles on click and marks required', () => {
    const onChange = vi.fn();
    render(
      <ConsentCheckbox id="c" label="Agree" description="desc" checked={false} onChange={onChange} required />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
