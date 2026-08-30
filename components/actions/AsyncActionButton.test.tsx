/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AsyncActionButton } from './AsyncActionButton';

afterEach(cleanup);

describe('AsyncActionButton', () => {
  it('shows the success label after a successful run', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    render(<AsyncActionButton idleLabel="Publish" run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument());
  });

  it('shows the error message after a failed run', async () => {
    const run = vi.fn().mockResolvedValue({ error: 'Could not publish.' });
    render(<AsyncActionButton idleLabel="Publish" run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not publish.'));
  });
});
