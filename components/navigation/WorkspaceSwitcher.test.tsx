/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

afterEach(cleanup);

const workspaces = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

describe('WorkspaceSwitcher', () => {
  it('filters and selects a workspace by clicking an option', () => {
    const onSelect = vi.fn();
    render(<WorkspaceSwitcher workspaces={workspaces} currentId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /search workspaces/i }), { target: { value: 'Beta' } });
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('selects the highlighted option with arrow keys and Enter', () => {
    const onSelect = vi.fn();
    render(<WorkspaceSwitcher workspaces={workspaces} currentId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    const search = screen.getByRole('combobox', { name: /search workspaces/i });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('closes on Escape without selecting', () => {
    const onSelect = vi.fn();
    render(<WorkspaceSwitcher workspaces={workspaces} currentId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on outside click', () => {
    render(
      <div>
        <div data-testid="outside" />
        <WorkspaceSwitcher workspaces={workspaces} currentId="a" onSelect={() => undefined} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
