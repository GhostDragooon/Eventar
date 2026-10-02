/** @vitest-environment jsdom */
import { vi } from 'vitest';

// RegisterCard imports the Server Action, which pulls in 'server-only' —
// forbidden in jsdom builds. These tests are about conditional rendering,
// not the action.
vi.mock('@/app/(public)/events/[id]/actions', () => ({
  registerForEvent: vi.fn(async () => ({ ok: true as const, emailDelivery: 'sent' as const })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { registerForEvent } from '@/app/(public)/events/[id]/actions';
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

// D2 (Ivan, 2026-10-01): an organiser may use the public register form (e.g. to
// register a colleague) but the server only ever writes a GUEST row for them
// (registerForEvent — asserted at the INSERT payload in its own test). The
// card's job is to say so honestly: one static line instead of the signed-in
// attribution + claim nudge, which both describe an attendee account the
// organiser does not have.
describe('RegisterCard — organiser (staff) session (D2)', () => {
  const D2_LINE = "You're signed in as an organiser. This creates a guest registration.";
  // What the page passes for a staff session: signedIn stays true (a session
  // exists), no prefill, and — if the count were ever non-zero — the nudge.
  const staffProps = {
    ...baseProps,
    lifecycle: 'registering' as const,
    signedIn: true,
    isStaff: true,
    unlinkedRegistrationsCount: 3,
  };

  it('shows the guest-registration line verbatim instead of any attendee attribution', () => {
    render(<RegisterCard {...staffProps} />);
    expect(screen.getByText(D2_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/registering as/i)).not.toBeInTheDocument();
  });

  it('never shows "Registering as …" even after the organiser types a colleague into the form', () => {
    render(<RegisterCard {...staffProps} />);
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: 'Alice Wong' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'alice@work.com' } });
    expect(screen.queryByText(/registering as/i)).not.toBeInTheDocument();
    expect(screen.getByText(D2_LINE)).toBeInTheDocument();
  });

  it('hides the "we noticed N earlier registrations" claim nudge', () => {
    render(<RegisterCard {...staffProps} />);
    expect(screen.queryByText(/we noticed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^link them$/i })).not.toBeInTheDocument();
  });

  it('keeps the form fully usable: submitting sends exactly what was typed', async () => {
    vi.mocked(registerForEvent).mockClear();
    render(<RegisterCard {...staffProps} />);
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: 'Alice Wong' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'alice@work.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    await waitFor(() => expect(screen.getByText(/guest registered/i)).toBeInTheDocument());
    expect(registerForEvent).toHaveBeenCalledWith({
      event_id: baseProps.eventId,
      full_name: 'Alice Wong',
      email: 'alice@work.com',
    });
  });

  // Found by the live backtest (2026-10-01): the success card was written for
  // the attendee ("your personal check-in pass", "this browser tab is your
  // proof of registration") and an organiser registering a guest was shown it.
  it('after registering a guest, speaks to the organiser, not as the attendee', async () => {
    render(<RegisterCard {...staffProps} />);
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: 'Alice Wong' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'alice@work.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    expect(await screen.findByText(/registered as a guest/i)).toBeInTheDocument();
    expect(screen.getByText(/a confirmation has been sent to/i)).toBeInTheDocument();
    expect(screen.getByText(/the guest receives their personal check-in pass/i)).toBeInTheDocument();
    expect(screen.queryByText(/see you on the day/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your personal check-in pass/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your confirmation email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/proof of registration/i)).not.toBeInTheDocument();
  });

  it('an attendee still gets the attendee success card (unchanged)', async () => {
    render(<RegisterCard {...baseProps} lifecycle="registering" signedIn defaultName="Alice Wong" defaultEmail="alice@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    expect(await screen.findByText(/see you on the day/i)).toBeInTheDocument();
    expect(screen.getByText(/we.ll email your personal check-in pass/i)).toBeInTheDocument();
    expect(screen.queryByText(/guest registered/i)).not.toBeInTheDocument();
  });

  it('is staff-only: an attendee session never sees the organiser line', () => {
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
    expect(screen.queryByText(D2_LINE)).not.toBeInTheDocument();
    // …and keeps its own attribution + nudge, unchanged.
    expect(screen.getByText(/registering as/i)).toBeInTheDocument();
    expect(screen.getByText(/we noticed 2 earlier registrations/i)).toBeInTheDocument();
  });
});

// Band 1 review F10 + F7: after registering a guest the card did not say who was
// registered, offered no way to register the next person, and left keyboard
// focus on <body>.
describe('RegisterCard — success card (organiser) follow-through', () => {
  const staffProps = {
    ...baseProps,
    lifecycle: 'registering' as const,
    signedIn: true,
    isStaff: true,
  };

  async function registerAlice() {
    render(<RegisterCard {...staffProps} />);
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: '  Alice Wong ' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'Alice@Work.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    return screen.findByRole('heading', { name: /registered as a guest/i });
  }

  it('echoes who was registered (name and the address as stored)', async () => {
    await registerAlice();
    expect(screen.getByText('Alice Wong')).toBeInTheDocument();
    expect(screen.getByText('(alice@work.com)')).toBeInTheDocument();
  });

  it('moves focus to the result heading, so the outcome is announced and focus is not lost', async () => {
    const heading = await registerAlice();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('"Register another guest" brings back an empty form with focus on the name field', async () => {
    await registerAlice();
    fireEvent.click(screen.getByRole('button', { name: /^register another guest$/i }));

    const name = screen.getByRole('textbox', { name: /full name/i });
    expect(name).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('');
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.queryByRole('heading', { name: /registered as a guest/i })).not.toBeInTheDocument();
  });

  it('an attendee gets neither the echo nor the "register another" control, but still gets focus on the result', async () => {
    render(<RegisterCard {...baseProps} lifecycle="registering" signedIn defaultName="Alice Wong" defaultEmail="alice@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    const heading = await screen.findByRole('heading', { name: /see you on the day/i });
    expect(screen.queryByRole('button', { name: /register another guest/i })).not.toBeInTheDocument();
    expect(screen.queryByText('(alice@example.com)')).not.toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  // The organiser is typing someone else's details; a browser offering the
  // organiser's own name there is a wrong-person registration waiting to happen.
  // The fields describe the guest, not the person at the keyboard (user-lens round 2, m5).
  it('asks for the guest, not "your" name, when an organiser is typing', () => {
    render(<RegisterCard {...staffProps} />);
    expect(screen.getByPlaceholderText("Guest's name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('guest@example.com')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
  });

  it('turns browser autofill off for an organiser and on for an attendee', () => {
    const { unmount } = render(<RegisterCard {...staffProps} />);
    expect(screen.getByRole('textbox', { name: /full name/i })).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveAttribute('autocomplete', 'off');
    unmount();
    render(<RegisterCard {...baseProps} lifecycle="registering" signedIn />);
    expect(screen.getByRole('textbox', { name: /full name/i })).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveAttribute('autocomplete', 'email');
  });
});

// Dev-lens round 2: registering revalidates the page, which re-renders the card
// with the new count. The person who took the LAST seat was then shown "At
// capacity" instead of the success they had just earned.
describe('RegisterCard — the last seat', () => {
  const props = { ...baseProps, lifecycle: 'registering' as const, maxAttendees: 5, currentCount: 4 };

  async function register(rendered: ReturnType<typeof render>) {
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: 'Alice Wong' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'alice@work.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /see you on the day|registered as a guest/i });
    return rendered;
  }

  it('keeps the attendee success card when the page re-renders with the card now full', async () => {
    const rendered = render(<RegisterCard {...props} />);
    await register(rendered);
    rendered.rerender(<RegisterCard {...props} currentCount={5} />);

    expect(screen.getByRole('heading', { name: /see you on the day/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /at capacity/i })).not.toBeInTheDocument();
  });

  it('keeps the organiser success card (echo and "Register another guest") too', async () => {
    const rendered = render(<RegisterCard {...props} signedIn isStaff />);
    await register(rendered);
    rendered.rerender(<RegisterCard {...props} signedIn isStaff currentCount={5} />);

    expect(screen.getByRole('heading', { name: /registered as a guest/i })).toBeInTheDocument();
    expect(screen.getByText('Alice Wong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register another guest/i })).toBeInTheDocument();
  });

  it('says "At capacity" once the organiser moves on to the next guest, because there is no seat left', async () => {
    const rendered = render(<RegisterCard {...props} signedIn isStaff />);
    await register(rendered);
    rendered.rerender(<RegisterCard {...props} signedIn isStaff currentCount={5} />);
    fireEvent.click(screen.getByRole('button', { name: /register another guest/i }));

    expect(screen.getByRole('heading', { name: /at capacity/i })).toBeInTheDocument();
  });
});

// Band 1 review F7 (error path) and rule 12: a rejected action must not become
// the crash screen, and the message is where keyboard focus goes.
describe('RegisterCard — a failed registration', () => {
  const props = { ...baseProps, lifecycle: 'registering' as const };

  function fillAndSubmit() {
    fireEvent.change(screen.getByRole('textbox', { name: /full name/i }), { target: { value: 'Alice Wong' } });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'alice@work.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
  }

  it('shows an inline error when the action rejects (network down) and leaves the form usable', async () => {
    vi.mocked(registerForEvent).mockRejectedValueOnce(new Error('network down'));
    render(<RegisterCard {...props} />);
    fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't complete the registration just now/i);
    expect(screen.getByRole('textbox', { name: /full name/i })).toHaveValue('Alice Wong');
    expect(screen.getByRole('button', { name: /^register$/i })).toBeEnabled();
  });

  it('moves focus to the error message, for a returned error as well as a rejected action', async () => {
    vi.mocked(registerForEvent).mockResolvedValueOnce({ error: 'That email is already registered for this event.' });
    render(<RegisterCard {...props} />);
    fillAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/already registered/i);
    await waitFor(() => expect(alert).toHaveFocus());
  });
});
