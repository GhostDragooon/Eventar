/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeammateInvitationForm } from './TeammateInvitationForm';

afterEach(cleanup);

const roles = [{ value: 'staff', label: 'Staff' }];

describe('TeammateInvitationForm', () => {
  it('blocks submission without a valid email and role', () => {
    const onInvite = vi.fn();
    render(<TeammateInvitationForm roles={roles} onInvite={onInvite} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('submits a valid draft and shows the success status', async () => {
    const onInvite = vi.fn().mockResolvedValue({ ok: true });
    render(<TeammateInvitationForm roles={roles} onInvite={onInvite} />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Staff' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Invitation sent.');
    expect(onInvite).toHaveBeenCalledWith({ email: 'a@example.com', role: 'staff', message: '' });
  });
});
