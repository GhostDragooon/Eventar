/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SignOutAction } from './SignOutAction';

afterEach(cleanup);

describe('SignOutAction', () => {
  it('shows the returned error, stays usable, and clears the error when the retry succeeds', async () => {
    const signOut = vi.fn().mockResolvedValueOnce('Could not sign out. Try again.').mockResolvedValueOnce(null);
    render(<SignOutAction signOut={signOut} />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out. Try again.');
    const again = screen.getByRole('button', { name: /sign out/i });
    expect(again).toBeEnabled();
    fireEvent.click(again);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
