/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MagicLinkSignInForm } from './MagicLinkSignInForm';

// The first render in a cold worker is slow under a loaded machine (the whole
// suite runs beside tests/jsxWhitespace.test.ts, which compiles every component
// twice); keep the async queries from timing out on that alone, as the sibling
// page tests do.
configure({ asyncUtilTimeout: 3000 });

afterEach(cleanup);

describe('MagicLinkSignInForm', () => {
  it('passes form data to the host action and reports a neutral success message', async () => {
    const submitMagicLink = vi.fn(async () => ({ ok: true as const }));
    render(<MagicLinkSignInForm submitMagicLink={submitMagicLink} />);
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), { target: { value: 'staff@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    await waitFor(() => expect(submitMagicLink).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });

  // The field clears once the action completes, so a mistyped address could not be
  // spotted (user-lens round 2, m7). Naming it says nothing about whether it exists.
  it('names the address the link was sent to, as typed', async () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true as const })} />);
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), { target: { value: '  Staff@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    expect(await screen.findByText(/check your inbox \(Staff@Example\.com\) for a sign-in link/i)).toBeInTheDocument();
  });

  it('renders the host action error without claiming success', async () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ error: 'Could not send link right now. Try again.' })} />);
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), { target: { value: 'staff@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send link/i);
  });

  // Native constraint validation is the first of the three validation layers.
  // `noValidate` on the form silently removed it; these two assert it is back.
  it('lets the browser block an empty submission before any network call', async () => {
    const submitMagicLink = vi.fn(async () => ({ ok: true as const }));
    render(<MagicLinkSignInForm submitMagicLink={submitMagicLink} />);
    const field = screen.getByRole('textbox', { name: /email address/i });
    expect(field.closest('form')).toHaveProperty('noValidate', false);
    expect((field as HTMLInputElement).checkValidity()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    await waitFor(() => expect(submitMagicLink).not.toHaveBeenCalled());
  });

  it('lets the browser block a malformed address before any network call', async () => {
    const submitMagicLink = vi.fn(async () => ({ ok: true as const }));
    render(<MagicLinkSignInForm submitMagicLink={submitMagicLink} />);
    const field = screen.getByRole('textbox', { name: /email address/i });
    fireEvent.change(field, { target: { value: 'not-an-email' } });
    expect((field as HTMLInputElement).checkValidity()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    await waitFor(() => expect(submitMagicLink).not.toHaveBeenCalled());
  });

  it('shows a default placeholder that the host can override', () => {
    const { rerender } = render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />);
    expect(screen.getByRole('textbox', { name: /email address/i })).toHaveAttribute('placeholder', 'you@company.com');
    rerender(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} placeholder="you@clinic.hk" />);
    expect(screen.getByRole('textbox', { name: /email address/i })).toHaveAttribute('placeholder', 'you@clinic.hk');
  });

  // tailwind-merge reads the caller's `text-label-md` (a font size) as a text
  // colour and evicts the Button's own text-on-primary, leaving dark text on the
  // blue fill (3.82:1, 1.96:1 in dark). jsdom cannot compute Tailwind, so the
  // contract is pinned on the class; it stays right after a global cn() fix.
  it('keeps both the primary text colour AND the label type size on the submit button', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />);
    const classes = screen.getByRole('button', { name: /send magic link/i }).className;
    // Dropping the `!` swaps which one tailwind-merge evicts (the size instead
    // of the colour), so asserting only the colour would still pass.
    expect(classes).toMatch(/(^|\s)text-on-primary!?(\s|$)/);
    expect(classes).toMatch(/(^|\s)text-label-md(\s|$)/);
  });

  it('labels the submit control "Send magic link" by default and lets the host override it', () => {
    const { rerender } = render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />);
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument();
    rerender(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} submitLabel="Email me a link" />);
    expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument();
  });

  it('shows an initial error passed from the host (e.g. a redirect from /auth/callback)', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} initialError="Your email is not on the organizer list." />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not on the organizer list/i);
  });

  // Band 1 review F4: the alert used to follow the submit button, below the fold
  // on a laptop, while its own text said "request a new one below".
  it('puts an initial error above the form so it is seen before the field it refers to', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} initialError="This sign-in link has expired or was already used." />);
    const alert = screen.getByRole('alert');
    const field = screen.getByRole('textbox', { name: /email address/i });
    expect(alert.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clears the initial error on the next submit, and a failed submit still shows under the button', async () => {
    const submitMagicLink = vi.fn(async () => ({ error: 'Could not send link right now. Try again.' }));
    render(<MagicLinkSignInForm submitMagicLink={submitMagicLink} initialError="This sign-in link has expired or was already used." />);
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), { target: { value: 'staff@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    expect(await screen.findByText(/could not send link/i)).toBeInTheDocument();
    expect(screen.queryByText(/expired or was already used/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('help copy references the organizer list by default (audience unset)', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />);
    expect(screen.getByText(/organizer list/i)).toBeInTheDocument();
    expect(screen.queryByText(/account already exists/i)).not.toBeInTheDocument();
  });

  // An invitee is not on the list yet: accepting the invite is what adds them.
  it('help copy drops the allowlist and says which address to use when audience="invitee"', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} audience="invitee" />);
    expect(screen.getByText(/use the address you want for your organiser account/i)).toBeInTheDocument();
    expect(screen.queryByText(/organizer list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/account already exists/i)).not.toBeInTheDocument();
  });

  it('help copy drops the organizer framing when audience="attendee"', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} audience="attendee" />);
    expect(screen.getByText(/account already exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/organizer list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/staff list/i)).not.toBeInTheDocument();
  });
});
