/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DestructiveDialog } from './DestructiveDialog';

afterEach(cleanup);

describe('DestructiveDialog', () => {
  it('keeps Confirm disabled until the acknowledgement is checked', () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveDialog
        open
        onOpenChange={() => undefined}
        title="Delete organisation"
        description="This cannot be undone."
        acknowledgement="I understand this permanently deletes all data."
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('resets the acknowledgement when closed', () => {
    const onOpenChange = vi.fn();
    render(
      <DestructiveDialog
        open
        onOpenChange={onOpenChange}
        title="Delete organisation"
        description="This cannot be undone."
        acknowledgement="I understand."
        onConfirm={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
