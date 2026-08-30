/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubscriptionDialog } from './SubscriptionDialog';

afterEach(cleanup);

describe('SubscriptionDialog', () => {
  it('rejects an invalid email', () => {
    const onReady = vi.fn();
    render(<SubscriptionDialog open onOpenChange={() => undefined} onReady={onReady} />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onReady with a valid email', () => {
    const onReady = vi.fn();
    render(<SubscriptionDialog open onOpenChange={() => undefined} onReady={onReady} />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onReady).toHaveBeenCalledWith('a@example.com');
  });
});
