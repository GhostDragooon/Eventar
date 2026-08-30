/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectableTagsPanel } from './SelectableTagsPanel';

afterEach(cleanup);

describe('SelectableTagsPanel', () => {
  it('emits selected tag identifiers', () => {
    const onChange = vi.fn();
    render(<SelectableTagsPanel tags={[{ id: 'cme', label: 'CME' }]} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'CME' }));
    expect(onChange).toHaveBeenCalledWith(['cme']);
  });

  it('deselects an already-active tag', () => {
    const onChange = vi.fn();
    render(<SelectableTagsPanel tags={[{ id: 'cme', label: 'CME' }]} selected={['cme']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /cme/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /cme/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
