/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

const baseProps = {
  open: true,
  title: 'Delete 3 events?',
  body: 'They move to the Deleted bucket.',
  confirmLabel: 'Delete 3 events',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders an accessible modal with title, body, and actions', () => {
    const { getByRole, getByText } = render(<ConfirmDialog {...baseProps} />);
    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(getByText('Delete 3 events?')).toBeInTheDocument();
    expect(getByText('They move to the Deleted bucket.')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Delete 3 events' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('moves focus to the confirm action on open', () => {
    const { getByRole } = render(<ConfirmDialog {...baseProps} />);
    expect(document.activeElement).toBe(getByRole('button', { name: 'Delete 3 events' }));
  });

  it('fires onConfirm / onCancel from the buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByRole } = render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(getByRole('button', { name: 'Delete 3 events' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('danger tone paints the confirm button with the error color', () => {
    const { getByRole } = render(<ConfirmDialog {...baseProps} tone="danger" />);
    expect(getByRole('button', { name: 'Delete 3 events' }).className).toContain('var(--error)');
  });

  it('disables both actions while pending', () => {
    const { getByRole } = render(<ConfirmDialog {...baseProps} pending />);
    expect(getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
