/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';
vi.mock('@/app/events/[id]/details/actions', () => ({ updateRegistrationClose: vi.fn() }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RegistrationCloseEditor } from './RegistrationCloseEditor';

afterEach(cleanup);

// Q51 (user-lens 2026-11-07): on an event this account may not change, the date is shown but cannot be edited or saved.
describe('RegistrationCloseEditor', () => {
  it('read-only: the date is disabled and there is no Save or Clear', () => {
    render(<RegistrationCloseEditor eventId="e1" current="2026-12-01T01:00:00.000Z" readOnly />);
    expect(screen.getByLabelText(/Close registration on/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('editable by default', () => {
    render(<RegistrationCloseEditor eventId="e1" current="2026-12-01T01:00:00.000Z" />);
    expect(screen.getByLabelText(/Close registration on/)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
