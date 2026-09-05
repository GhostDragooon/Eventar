/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MagicLinkSignInForm } from './MagicLinkSignInForm';

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

  it('help copy references the organizer list by default (audience unset)', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />);
    expect(screen.getByText(/organizer list/i)).toBeInTheDocument();
    expect(screen.queryByText(/account already exists/i)).not.toBeInTheDocument();
  });

  it('help copy drops the organizer framing when audience="attendee"', () => {
    render(<MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} audience="attendee" />);
    expect(screen.getByText(/account already exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/organizer list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/staff list/i)).not.toBeInTheDocument();
  });
});
