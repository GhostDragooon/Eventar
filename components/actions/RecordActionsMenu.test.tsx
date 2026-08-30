/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RecordActionsMenu } from './RecordActionsMenu';

afterEach(cleanup);

const actions = [
  { id: 'edit', label: 'Edit', description: 'Change details', icon: 'edit' },
  { id: 'remove', label: 'Remove', description: 'Cannot be undone', icon: 'delete', destructive: true },
];

describe('RecordActionsMenu', () => {
  it('opens the menu and calls onAction, then closes', () => {
    const onAction = vi.fn();
    render(<RecordActionsMenu actions={actions} onAction={onAction} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /remove/i }));
    expect(onAction).toHaveBeenCalledWith('remove');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
