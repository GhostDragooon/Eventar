/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CategorySelectionForm } from './CategorySelectionForm';

afterEach(cleanup);

describe('CategorySelectionForm', () => {
  it('requires a category before submit', () => {
    render(<CategorySelectionForm options={[{ id: 'clinical', label: 'Clinical' }]} onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one/i);
  });

  it('submits the selected category ids', () => {
    const onSubmit = vi.fn();
    render(<CategorySelectionForm options={[{ id: 'clinical', label: 'Clinical' }]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('option', { name: /clinical/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith(['clinical']);
  });
});
