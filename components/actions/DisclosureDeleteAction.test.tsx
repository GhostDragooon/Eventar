/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DisclosureDeleteAction } from './DisclosureDeleteAction';

afterEach(cleanup);

describe('DisclosureDeleteAction', () => {
  it('reveals the confirmation only after the disclosure opens', () => {
    const onDelete = vi.fn();
    render(<DisclosureDeleteAction label="Remove speaker" onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove speaker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
