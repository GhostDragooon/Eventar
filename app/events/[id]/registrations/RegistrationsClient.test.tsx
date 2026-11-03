/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';

const updateRegistrationContact = vi.hoisted(() => vi.fn());
const setRegistrationRole = vi.hoisted(() => vi.fn());
const removeRegistrationRole = vi.hoisted(() => vi.fn());
vi.mock('./actions', () => ({ updateRegistrationContact }));
vi.mock('../details/multiBodyActions', () => ({ setRegistrationRole, removeRegistrationRole }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RegistrationsClient, { type RegistrationRow } from './RegistrationsClient';

const EVENT = '11111111-1111-4111-8111-111111111111';
const row = (over: Partial<RegistrationRow> & { id: string; full_name: string; email: string }): RegistrationRow => ({
  registration_code: 'ABC123',
  status: 'registered',
  registeredLabel: '1 Nov 2026, 09:00',
  checkInLabel: null,
  linked: false,
  ...over,
});
const ROWS = [
  row({ id: 'r1', full_name: 'Alex Wong', email: 'alex@example.invalid' }),
  row({ id: 'r2', full_name: 'Sam Ho', email: 'sam@example.invalid', status: 'attended', checkInLabel: '1 Nov 2026, 10:00' }),
  row({ id: 'r3', full_name: 'Lin Chan', email: 'lin@example.invalid', linked: true }),
];

function renderPage(over: Partial<React.ComponentProps<typeof RegistrationsClient>> = {}) {
  return render(
    <RegistrationsClient eventId={EVENT} rows={ROWS} initialRoles={{}} rolesUnavailable={false} canEdit canEditRoles {...over} />,
  );
}

beforeEach(() => {
  updateRegistrationContact.mockReset();
  setRegistrationRole.mockReset();
  removeRegistrationRole.mockReset();
});
afterEach(cleanup);

describe('Registrations list', () => {
  it('lists everyone with email, registered time and attended state, and offers no check-in action', () => {
    renderPage();
    expect(screen.getByText('alex@example.invalid')).toBeTruthy();
    expect(screen.getAllByText(/Registered 1 Nov 2026, 09:00/).length).toBe(3);
    expect(screen.getByText(/Attended 1 Nov 2026, 10:00/)).toBeTruthy();
    expect(screen.queryByText(/Check in/i)).toBeNull();
  });

  it('filters by status and by search, with counts on the filters', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Attended (1)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Attended (1)' }));
    expect(screen.queryByText('Alex Wong')).toBeNull();
    expect(screen.getByText('Sam Ho')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All (3)' }));
    fireEvent.change(screen.getByLabelText('Search name or email'), { target: { value: 'LIN@' } });
    expect(screen.getByText('Lin Chan')).toBeTruthy();
    expect(screen.queryByText('Alex Wong')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search name or email'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches.')).toBeTruthy();
  });
});

describe('Edit dialog', () => {
  it('saves the corrected name and email, then shows them on the row', async () => {
    updateRegistrationContact.mockResolvedValue({ ok: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex Wong' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/check-in code stays the same/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'Alex.Wong@Example.invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updateRegistrationContact).toHaveBeenCalledWith({
      registrationId: 'r1',
      fullName: 'Alex Wong',
      email: 'Alex.Wong@Example.invalid',
    });
    expect(screen.getByText('alex.wong@example.invalid')).toBeTruthy();
  });

  it('locks the email of an account-linked registration and says why; the name stays editable', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lin Chan' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('Email') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).disabled).toBe(false);
    expect(within(dialog).getByText(/belongs to an Eventar account/)).toBeTruthy();
  });

  it('locks the email of an attended registration and says why; the name stays editable', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sam Ho' }));
    const dialog = screen.getByRole('dialog');
    const email = within(dialog).getByLabelText('Email') as HTMLInputElement;
    expect(email.disabled).toBe(true);
    expect(email.getAttribute('aria-describedby')).toContain('edit-email-note');
    expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).disabled).toBe(false);
    expect(within(dialog).getByText(/already checked in, so their email cannot be changed/)).toBeTruthy();
    expect(within(dialog).queryByText(/belongs to an Eventar account/)).toBeNull();
  });

  it('leaves the email of a registered (not yet attended) row editable', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex Wong' }));
    expect((within(screen.getByRole('dialog')).getByLabelText('Email') as HTMLInputElement).disabled).toBe(false);
  });

  it('shows the refusal in the dialog and keeps the old value on the row', async () => {
    updateRegistrationContact.mockResolvedValue({ error: 'Another registration for this event already uses that email.' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex Wong' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already uses that email/);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('alex@example.invalid')).toBeTruthy();
  });

  it('does not claim nothing was saved when the reply is lost', async () => {
    updateRegistrationContact.mockRejectedValue(new Error('network'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex Wong' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Reload this page/);
    expect(alert.textContent).not.toMatch(/not saved/i);
  });
});

describe('Roles', () => {
  it('sets a role through the action and marks the chip pressed', async () => {
    setRegistrationRole.mockResolvedValue({ ok: true, data: undefined });
    renderPage();
    const chip = screen.getByRole('button', { name: 'chair — Alex Wong' });
    fireEvent.click(chip);
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'));
    expect(setRegistrationRole).toHaveBeenCalledWith({ registrationId: 'r1', eventId: EVENT, roleCode: 'chair' });
  });

  // User-lens M-1: a disabled button drops keyboard focus to <body>, and nothing announced the result.
  it('keeps focus on the chip while the call is in flight and announces the result', async () => {
    let done!: (v: { ok: true; data: undefined }) => void;
    setRegistrationRole.mockReturnValue(new Promise((r) => { done = r; }));
    renderPage();
    const chip = screen.getByRole('button', { name: 'chair — Alex Wong' });
    chip.focus();
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(chip);
    fireEvent.click(chip);
    expect(setRegistrationRole).toHaveBeenCalledTimes(1);
    done({ ok: true, data: undefined });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Alex Wong is now chair.'));
  });

  it('shows the error and leaves the chip off when the action refuses', async () => {
    setRegistrationRole.mockResolvedValue({ error: 'Not authorised.' });
    renderPage();
    const chip = screen.getByRole('button', { name: 'presenter — Alex Wong' });
    fireEvent.click(chip);
    expect((await screen.findByRole('alert')).textContent).toBe('Not authorised.');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('locks the chips once the person has attended', () => {
    renderPage();
    const chip = screen.getByRole('button', { name: 'chair — Sam Ho (locked: already attended)' }) as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    // The reason is in the accessible name, not only in a title on a disabled button (review UX-04 m3).
    expect(screen.getByRole('button', { name: 'chair — Alex Wong' })).toHaveProperty('disabled', false);
  });
});

describe('Cancelled registrations', () => {
  it('lock their chips: a cancelled registration earns nothing, so a role would be meaningless', () => {
    renderPage({ rows: [row({ id: 'r9', full_name: 'Kim Lee', email: 'kim@example.invalid', status: 'cancelled' })] });
    expect((screen.getByRole('button', { name: 'presenter — Kim Lee (locked: cancelled)' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Edit rights without role rights (not the creator of the event)', () => {
  it('keeps Edit but shows roles as text, with no toggles that would always fail', () => {
    renderPage({ canEditRoles: false, initialRoles: { r1: ['chair'] } });
    expect(screen.getByRole('button', { name: 'Edit Alex Wong' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /chair —/ })).toBeNull();
    expect(screen.getByText('chair')).toBeTruthy();
  });
});

describe('Read-only role', () => {
  it('sees the list and the roles as text, with no Edit button and no toggles', () => {
    renderPage({ canEdit: false, canEditRoles: false, initialRoles: { r1: ['chair'] } });
    expect(screen.getByText('Alex Wong')).toBeTruthy();
    expect(screen.getByText('chair')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: /chair —/ })).toBeNull();
  });
});
