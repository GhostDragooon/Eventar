/** @vitest-environment jsdom */
import { vi } from 'vitest';

// RegisterCard imports the Server Action, which pulls in 'server-only' —
// forbidden in jsdom builds. These tests are about conditional rendering,
// not the action.
vi.mock('@/app/(public)/events/[id]/actions', () => ({
  registerForEvent: vi.fn(async () => ({ ok: true as const, emailDelivery: 'sent' as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RegisterCard from './RegisterCard';

// Vitest doesn't auto-import RTL's cleanup (project config has `globals` off);
// without this, renders accumulate in jsdom across tests.
afterEach(cleanup);

const baseProps = {
  eventId: '11111111-2222-4333-8444-555555555555',
  maxAttendees: null,
  currentCount: 0,
  // These tests are about the lifecycle-gated render branches; the delivery
  // strip only appears in the success block, which none of them reach.
  deliveryLive: true,
};

describe('RegisterCard — registration window (form layer of the 3-layer rule)', () => {
  it('shows the form while registering', () => {
    render(<RegisterCard {...baseProps} lifecycle="registering" />);
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  it('hides the form and explains closure when lifecycle is upcoming', () => {
    render(<RegisterCard {...baseProps} lifecycle="upcoming" />);
    expect(screen.queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
    expect(screen.getByText(/registration for this event has closed/i)).toBeInTheDocument();
  });

  it('hides the form and points walk-ups to check-in staff when the event is live', () => {
    render(<RegisterCard {...baseProps} lifecycle="live" />);
    expect(screen.queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
    expect(screen.getByText(/event in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/see the event staff at check-in/i)).toBeInTheDocument();
  });

  it('hides the form with an "ended" message when the event is completed', () => {
    render(<RegisterCard {...baseProps} lifecycle="completed" />);
    expect(screen.queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
    expect(screen.getByText(/this event has already ended/i)).toBeInTheDocument();
  });

  it('prefers the closed message over the capacity message when both apply', () => {
    render(<RegisterCard {...baseProps} maxAttendees={10} currentCount={10} lifecycle="completed" />);
    expect(screen.queryByText(/at capacity/i)).not.toBeInTheDocument();
    expect(screen.getByText(/this event has already ended/i)).toBeInTheDocument();
  });
});
