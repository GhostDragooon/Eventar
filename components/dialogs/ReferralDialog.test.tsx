/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReferralDialog } from './ReferralDialog';

afterEach(cleanup);

describe('ReferralDialog', () => {
  it('blocks preparation until email is valid and consent is checked', () => {
    const onReady = vi.fn();
    render(<ReferralDialog open onOpenChange={() => undefined} onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onReady with the prepared draft', () => {
    const onReady = vi.fn();
    render(<ReferralDialog open onOpenChange={() => undefined} onReady={onReady} />);
    fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }));
    expect(onReady).toHaveBeenCalledWith({ email: 'a@example.com', consent: true });
  });
});
