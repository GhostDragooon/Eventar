/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SaveToggleButton } from './SaveToggleButton';

afterEach(cleanup);

describe('SaveToggleButton', () => {
  it('calls onSaveChange with the flipped value', async () => {
    const onSaveChange = vi.fn().mockResolvedValue({ ok: true });
    render(<SaveToggleButton saved={false} onSaveChange={onSaveChange} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaveChange).toHaveBeenCalledWith(true));
  });

  it('surfaces an error without changing the saved label', async () => {
    const onSaveChange = vi.fn().mockResolvedValue({ error: 'Could not save.' });
    render(<SaveToggleButton saved={false} onSaveChange={onSaveChange} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save.'));
  });
});
