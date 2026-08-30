/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PinnedItemsList } from './PinnedItemsList';

afterEach(cleanup);

describe('PinnedItemsList', () => {
  it('emits deterministic pinned item controls', () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    render(
      <PinnedItemsList
        items={[{ id: '1', label: 'First', href: '/1' }, { id: '2', label: 'Second', href: '/2' }]}
        onMove={onMove}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /move second up/i }));
    expect(onMove).toHaveBeenCalledWith('2', 'up');
    fireEvent.click(screen.getByRole('button', { name: /remove first/i }));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('disables the boundary move controls', () => {
    render(
      <PinnedItemsList
        items={[{ id: '1', label: 'First', href: '/1' }, { id: '2', label: 'Second', href: '/2' }]}
        onMove={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /move first up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move second down/i })).toBeDisabled();
  });
});
