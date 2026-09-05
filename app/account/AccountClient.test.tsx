/** @vitest-environment jsdom */
import { vi } from 'vitest';

// AccountClient imports 'use server' actions; jsdom builds forbid 'server-only'.
// Mock every SA the component pulls in so the render is hermetic.
vi.mock('./actions', () => ({
  updateMyAccount: vi.fn(async () => ({ ok: true as const, data: { full_name: 'Alice Wong' } })),
  claimMyRegistrations: vi.fn(async () => ({ ok: true as const, data: { claimed: 2 } })),
  resendVerificationEmail: vi.fn(async () => ({ ok: true as const, data: { sent: true as const } })),
  changeEmail: vi.fn(async () => ({
    ok: true as const,
    data: { sent: true as const, new_email: 'new@example.com' },
  })),
}));

// SignOutAction inside the Session card calls supabase.auth.signOut() then
// window.location.href = '/'. jsdom lets us stub the auth method, but the
// URL setter throws in test — we override it too.
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  }),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountClient } from './AccountClient';
import { changeEmail, claimMyRegistrations, resendVerificationEmail } from './actions';
import type { AccountView } from './schema';

afterEach(cleanup);

const initialAccount: AccountView = {
  id: '11111111-2222-4333-8444-555555555555',
  full_name: 'Alice Wong',
  first_name: 'Alice',
  last_name: 'Wong',
  salutation: 'Dr',
  preferred_name: null,
  phone: null,
  phone_country_code: null,
  country_code: 'HK',
  display_language: 'en',
  locale: 'en-HK',
  timezone: 'Asia/Hong_Kong',
};

describe('AccountClient — walk-in claim banner', () => {
  it('hides the banner when the initial unlinked count is 0', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={0}
      />,
    );
    expect(screen.queryByRole('button', { name: /link \d+ registrations? to my account/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/unlinked registrations? for your email/i)).not.toBeInTheDocument();
  });

  it('renders the banner when the count is > 0, with matching count wording', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={2}
      />,
    );
    expect(screen.getByText(/we found 2 unlinked registrations for your email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link \d+ registrations? to my account/i })).toBeInTheDocument();
  });

  it('singular wording when the count is exactly 1', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={1}
      />,
    );
    expect(screen.getByText(/we found 1 unlinked registration for your email/i)).toBeInTheDocument();
  });

  it('clicking "Link them" calls claimMyRegistrations and clears the banner', async () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={2}
      />,
    );
    // React 19 renders inside startTransition synchronously in the test env
    // but Promises still need to flush before we assert on the post-await UI.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /link \d+ registrations? to my account/i }));
    });
    expect(claimMyRegistrations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /link \d+ registrations? to my account/i })).not.toBeInTheDocument();
    expect(screen.getByText(/linked 2 registrations to your account/i)).toBeInTheDocument();
  });

  it('email_unverified error keeps the banner visible and shows the specific copy', async () => {
    // Second-pass review IMPORTANT 2: the error branch was untested. In the
    // slice this is now reachable only when a stale session leaves the user
    // authenticated but email_confirmed_at null — the count SA gates on the
    // same flag, so under normal conditions the banner would not have shown
    // in the first place. This test proves the failure copy is honest when
    // the alignment ever slips.
    vi.mocked(claimMyRegistrations).mockResolvedValueOnce({
      ok: false as const,
      error: 'email_unverified' as const,
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={2}
      />,
    );
    const button = screen.getByRole('button', { name: /link \d+ registrations? to my account/i });
    await act(async () => {
      fireEvent.click(button);
    });
    // Banner stays (count did not drop to 0) so the user can retry once
    // their email is confirmed.
    expect(screen.getByRole('button', { name: /link \d+ registrations? to my account/i })).toBeInTheDocument();
    // Specific error copy, not generic.
    expect(screen.getByText(/confirm your email first/i)).toBeInTheDocument();
  });

  it('rate_limited error renders the correct message and keeps the banner', async () => {
    vi.mocked(claimMyRegistrations).mockResolvedValueOnce({
      ok: false as const,
      error: 'rate_limited' as const,
      retryAfterMs: 5000,
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={1}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /link \d+ registrations? to my account/i }));
    });
    expect(screen.getByRole('button', { name: /link \d+ registrations? to my account/i })).toBeInTheDocument();
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('generic error renders the fallback message and keeps the banner', async () => {
    vi.mocked(claimMyRegistrations).mockResolvedValueOnce({
      ok: false as const,
      error: 'db_error' as const,
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        initialUnlinkedCount={3}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /link \d+ registrations? to my account/i }));
    });
    expect(screen.getByRole('button', { name: /link \d+ registrations? to my account/i })).toBeInTheDocument();
    expect(screen.getByText(/could not link right now/i)).toBeInTheDocument();
  });
});

describe('AccountClient — Session (sign-out) + prefs note', () => {
  it('renders a Session section with the signed-in email and a Sign out control', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    // Email now appears in both the Change email intro and the Session card
    // ("Signed in as X"), so any-match confirms the Session card rendered.
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('shows the appearance-follows-device note', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    expect(screen.getByText(/appearance and text size follow your device settings/i)).toBeInTheDocument();
  });
});

describe('AccountClient — verify-email section', () => {
  beforeEach(() => {
    vi.mocked(resendVerificationEmail).mockClear();
  });

  it('is hidden when emailConfirmed is true', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    expect(screen.queryByRole('button', { name: /resend verification email/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/hasn't been verified yet/i)).not.toBeInTheDocument();
  });

  it('renders the section and lists the pending email when emailConfirmed is false', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed={false}
      />,
    );
    // Copy references the unverified address explicitly so the user knows
    // which inbox to check.
    expect(screen.getByText(/hasn't been verified yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
  });

  it('clicking the resend button calls resendVerificationEmail and shows the success message', async () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    });
    expect(resendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/verification email sent to alice@example\.com/i)).toBeInTheDocument();
  });

  it('rate_limited response keeps the button visible with the specific error copy', async () => {
    vi.mocked(resendVerificationEmail).mockResolvedValueOnce({
      ok: false as const,
      error: 'rate_limited' as const,
      retryAfterMs: 5000,
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    });
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('after a successful resend, the CTA-adjacent copy flips + the button locks (user-lens IMPORTANT 3)', async () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed={false}
      />,
    );
    // Pre-click: the invitation line is the "didn't receive the link" prompt
    // and the CTA reads "Resend verification email".
    expect(screen.getByText(/didn’t receive the link/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    });
    // Post-success: the invitation line acknowledges the send, the button
    // relabels to "Link sent" and is disabled — prevents the "user resends
    // twice in a second" duplicate-click hazard.
    expect(screen.queryByText(/didn’t receive the link/i)).not.toBeInTheDocument();
    expect(screen.getByText(/a fresh link was just sent/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /resend verification email/i }) as HTMLButtonElement;
    expect(button.textContent).toMatch(/link sent/i);
    expect(button.disabled).toBe(true);
  });
});

describe('AccountClient — Change email section', () => {
  it('renders the current email and a Change email heading', () => {
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    expect(screen.getByRole('heading', { name: /change email/i })).toBeInTheDocument();
    // The current-email display appears in BOTH the Change email intro and
    // the Session card ("Signed in as X"), so any-match is the honest check.
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
  });

  it('happy path — calls changeEmail with next=/account, clears the input, renders confirmation copy', async () => {
    vi.mocked(changeEmail).mockResolvedValueOnce({
      ok: true as const,
      data: { sent: true as const, new_email: 'new@example.com' },
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    const input = screen.getByLabelText(/new email/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send confirmation/i }));
    });
    expect(changeEmail).toHaveBeenCalledWith('new@example.com', '/account');
    expect(input.value).toBe('');
    expect(screen.getByText(/confirmation sent to new@example\.com/i)).toBeInTheDocument();
  });

  it('email_exists response renders the specific error copy', async () => {
    vi.mocked(changeEmail).mockResolvedValueOnce({
      ok: false as const,
      error: 'email_exists' as const,
    });
    render(
      <AccountClient
        initialAccount={initialAccount}
        initialProfile={null}
        email="alice@example.com"
        emailConfirmed
      />,
    );
    fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'taken@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send confirmation/i }));
    });
    expect(screen.getByText(/another account already uses that email/i)).toBeInTheDocument();
  });
});
