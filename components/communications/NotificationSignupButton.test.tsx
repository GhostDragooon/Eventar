/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotificationSignupButton } from './NotificationSignupButton';

afterEach(cleanup);

describe('NotificationSignupButton', () => {
  it('expands into a form and subscribes with a valid email', async () => {
    const onSubscribe = vi.fn().mockResolvedValue({ ok: true });
    render(<NotificationSignupButton onSubscribe={onSubscribe} />);
    fireEvent.click(screen.getByRole('button', { name: /get updates/i }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Subscribed.');
    expect(onSubscribe).toHaveBeenCalledWith('a@example.com');
  });
});
