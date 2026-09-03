/** @vitest-environment jsdom */
import { vi } from 'vitest';

// RegisterCard imports the Server Action, which pulls in 'server-only' —
// forbidden in jsdom builds. These tests are about conditional rendering,
// not the action.
vi.mock('@/app/(public)/events/[id]/actions', () => ({
  registerForEvent: vi.fn(async () => ({ ok: true as const, emailDelivery: 'sent' as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('RegisterCard — self-serve walk-in orchestration', () => {
  it('prefills name and email when signed-in defaults are passed', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Alice Wong"
        defaultEmail="alice@example.com"
      />,
    );
    const name = screen.getByRole('textbox', { name: /full name/i }) as HTMLInputElement;
    const email = screen.getByRole('textbox', { name: /email/i }) as HTMLInputElement;
    expect(name.value).toBe('Alice Wong');
    expect(email.value).toBe('alice@example.com');
  });

  it('renders the "Sign in or sign up first" nudge only when signInHref is passed', () => {
    const { rerender } = render(
      <RegisterCard {...baseProps} lifecycle="registering" />,
    );
    expect(screen.queryByRole('link', { name: /sign in or sign up first/i })).not.toBeInTheDocument();

    rerender(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signInHref="/account/sign-in?next=/events/xyz"
      />,
    );
    const link = screen.getByRole('link', { name: /sign in or sign up first/i });
    expect(link).toHaveAttribute('href', '/account/sign-in?next=/events/xyz');
  });

  it('does not render the nudge outside the registering lifecycle', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="completed"
        signInHref="/account/sign-in?next=/events/xyz"
      />,
    );
    expect(screen.queryByRole('link', { name: /sign in or sign up first/i })).not.toBeInTheDocument();
  });

  it('renders the "Registering as" attribution line when signed-in defaults are present', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Alice Wong"
        defaultEmail="alice@example.com"
      />,
    );
    expect(screen.getByText(/registering as/i)).toBeInTheDocument();
    expect(screen.getByText(/alice wong/i)).toBeInTheDocument();
    // "not you? Edit" prompt fires on initial render (state === defaults).
    expect(screen.getByText(/not you\? edit the fields below/i)).toBeInTheDocument();
  });

  it('renders the attribution line for a phone-auth signed-in visitor (name only, no email)', () => {
    // Second-pass review MODERATE 5: derive `signedIn` from a dedicated
    // prop, not from `defaultEmail !== undefined`. A signed-in user with
    // no email (phone auth, or a session where email is null) still
    // deserves the attribution line and the discovery-count surface.
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Alice Wong"
      />,
    );
    expect(screen.getByText(/registering as/i)).toBeInTheDocument();
    expect(screen.getByText(/alice wong/i)).toBeInTheDocument();
  });

  it('does not render the attribution line when signed-out (no defaults)', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signInHref="/account/sign-in?next=/events/xyz"
      />,
    );
    expect(screen.queryByText(/registering as/i)).not.toBeInTheDocument();
  });

  it('attribution line reflects the CURRENT form state, not the initial defaults', () => {
    // Defect A guard — a stale label showing the defaults after edit is
    // actively misleading (same failure class as "control one layer above
    // where the write happens").
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Bob"
        defaultEmail="bob@example.com"
      />,
    );
    const nameInput = screen.getByRole('textbox', { name: /full name/i });
    const emailInput = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(nameInput, { target: { value: 'Alice Wong' } });
    fireEvent.change(emailInput, { target: { value: 'alice@work.com' } });
    // Line shows the edited values, not "Bob · bob@example.com".
    expect(screen.getByText(/alice wong/i)).toBeInTheDocument();
    expect(screen.getByText(/alice@work\.com/i)).toBeInTheDocument();
    expect(screen.queryByText(/^bob$/i)).not.toBeInTheDocument();
    // "not you?" prompt drops once state diverges from defaults — the
    // prompt only makes sense while the form still shows the pre-filled
    // account info.
    expect(screen.queryByText(/not you\? edit the fields below/i)).not.toBeInTheDocument();
  });

  it('surfaces the discovery-beat "we noticed N earlier registrations" line for signed-in visitors with a positive count', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Alice Wong"
        defaultEmail="alice@example.com"
        unlinkedRegistrationsCount={2}
      />,
    );
    expect(screen.getByText(/we noticed 2 earlier registrations/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /^link them$/i });
    expect(link).toHaveAttribute('href', '/account');
  });

  it('uses singular wording when unlinkedRegistrationsCount is 1', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signedIn
        defaultName="Alice Wong"
        defaultEmail="alice@example.com"
        unlinkedRegistrationsCount={1}
      />,
    );
    expect(screen.getByText(/we noticed 1 earlier registration/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^link it$/i })).toBeInTheDocument();
  });

  it('hides the discovery-beat line when signed-out (count is meaningless without a session)', () => {
    render(
      <RegisterCard
        {...baseProps}
        lifecycle="registering"
        signInHref="/account/sign-in?next=/events/xyz"
        unlinkedRegistrationsCount={5}
      />,
    );
    expect(screen.queryByText(/we noticed/i)).not.toBeInTheDocument();
  });
});
