/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RetryFeedback } from './RetryFeedback';

afterEach(cleanup);

describe('RetryFeedback', () => {
  it('renders the message as an alert and calls onRetry', () => {
    const onRetry = vi.fn();
    render(<RetryFeedback message="Send failed." pending={false} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Send failed.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
