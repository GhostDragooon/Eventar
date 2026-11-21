/** @vitest-environment jsdom */
import { vi } from 'vitest';

const { selfCheckInMock } = vi.hoisted(() => ({ selfCheckInMock: vi.fn() }));
vi.mock('./actions', () => ({ selfCheckIn: selfCheckInMock }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConfirmButton from './ConfirmButton';

afterEach(cleanup);

describe('ConfirmButton', () => {
  it('shows the arrival hint while the button can still work', () => {
    render(<ConfirmButton code="WK-AAAAAA" />);
    expect(screen.getByText(/Tap when you arrive/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm I’m here/ })).toBeEnabled();
  });

  it('after a final refusal, disables the button and drops the arrival hint', async () => {
    selfCheckInMock.mockResolvedValue({ error: 'Check-in for this event has closed. Please see a member of staff.', final: true });
    render(<ConfirmButton code="WK-AAAAAA" />);
    fireEvent.click(screen.getByRole('button', { name: /Confirm I’m here/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('has closed'));
    expect(screen.getByRole('button', { name: /Confirm I’m here/ })).toBeDisabled();
    expect(screen.queryByText(/Tap when you arrive/)).toBeNull();
  });

  it('after a retryable error, keeps the button enabled', async () => {
    selfCheckInMock.mockResolvedValue({ error: 'Too many attempts. Please try again in a moment.' });
    render(<ConfirmButton code="WK-AAAAAA" />);
    fireEvent.click(screen.getByRole('button', { name: /Confirm I’m here/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Confirm I’m here/ })).toBeEnabled();
  });
});
