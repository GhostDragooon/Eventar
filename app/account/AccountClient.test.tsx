/** @vitest-environment jsdom */
import { vi } from 'vitest';

// AccountClient imports 'use server' actions; jsdom builds forbid 'server-only'.
// The banner test only exercises the claim path (button click → mocked RPC →
// banner clears) and the shape of the initial render, so mocking both is safe.
vi.mock('./actions', () => ({
  updateMyAccount: vi.fn(async () => ({ ok: true as const, data: { full_name: 'Alice Wong' } })),
  claimMyRegistrations: vi.fn(async () => ({ ok: true as const, data: { claimed: 2 } })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountClient } from './AccountClient';
import { claimMyRegistrations } from './actions';
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
