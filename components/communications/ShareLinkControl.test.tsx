/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShareLinkControl } from './ShareLinkControl';

afterEach(cleanup);

describe('ShareLinkControl', () => {
  it('reveals the link only after expanding, and copies via onCopy', async () => {
    const onCopy = vi.fn().mockResolvedValue(true);
    render(<ShareLinkControl label="Share event" url="https://example.com/e/1" onCopy={onCopy} />);
    expect(screen.queryByText('https://example.com/e/1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share event' }));
    expect(screen.getByText('https://example.com/e/1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onCopy).toHaveBeenCalledWith('https://example.com/e/1');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
