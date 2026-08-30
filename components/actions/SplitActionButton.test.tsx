/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitActionButton } from './SplitActionButton';

afterEach(cleanup);

const actions = [{ id: 'duplicate', label: 'Duplicate' }];

describe('SplitActionButton', () => {
  it('calls onAction("primary") from the primary segment', () => {
    const onAction = vi.fn();
    render(<SplitActionButton primaryLabel="Publish" actions={actions} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onAction).toHaveBeenCalledWith('primary');
  });

  it('opens the menu from the caret and calls onAction with the chosen id', () => {
    const onAction = vi.fn();
    render(<SplitActionButton primaryLabel="Publish" actions={actions} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onAction).toHaveBeenCalledWith('duplicate');
  });
});
