/** @vitest-environment jsdom */
import { vi } from 'vitest';

// SettingsClient now imports the shared change-email SA from
// @/app/account/actions. The action file is 'use server' + hits the admin
// client, which jsdom cannot load — mock the whole module so the test suite
// stays hermetic.
vi.mock('@/app/account/actions', () => ({
  changeEmail: vi.fn(async () => ({
    ok: true as const,
    data: { sent: true as const, new_email: 'new@example.com' },
  })),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsClient, { SettingsSignOut } from './SettingsClient';
import { changeEmail } from '@/app/account/actions';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { TEXT_SIZE_STORAGE_KEY } from '@/lib/textSize';

afterEach(cleanup);

const STAFF = { email: 'ahf.ivan@gmail.com', role: 'eventar_staff' as const };

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('light', 'dark', 'text-small', 'text-large');
});

describe('SettingsClient — Appearance', () => {
  it('renders the three theme options with their descriptions', () => {
    render(<SettingsClient staff={STAFF} />);
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText(/operating-system preference/i)).toBeTruthy();
  });

  it('reflects the persisted theme on mount (dark)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<SettingsClient staff={STAFF} />);
    const radio = screen.getByRole('radio', { name: /dark/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('persists + applies the class when a new theme is picked', () => {
    render(<SettingsClient staff={STAFF} />);
    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clears the class when "System" is picked', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark');
    render(<SettingsClient staff={STAFF} />);
    fireEvent.click(screen.getByRole('radio', { name: /system/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});

describe('SettingsClient — Text size', () => {
  it('renders the three size options', () => {
    render(<SettingsClient staff={STAFF} />);
    expect(screen.getByText('Small')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByText('Large')).toBeTruthy();
  });

  it('persists + applies the class when "Large" is picked', () => {
    render(<SettingsClient staff={STAFF} />);
    fireEvent.click(screen.getByRole('radio', { name: /large/i }));
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe('large');
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
  });

  it('clears the class when "Default" is picked after Large', () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'large');
    document.documentElement.classList.add('text-large');
    render(<SettingsClient staff={STAFF} />);
    fireEvent.click(screen.getByRole('radio', { name: /default/i }));
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
    expect(document.documentElement.classList.contains('text-small')).toBe(false);
  });

  it('appearance and text-size live on independent storage keys', () => {
    render(<SettingsClient staff={STAFF} />);
    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
    fireEvent.click(screen.getByRole('radio', { name: /large/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe('large');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
  });
});

describe('SettingsClient — Account', () => {
  it('shows the staff email and the human-readable role', () => {
    render(<SettingsClient staff={STAFF} />);
    // The email now appears in TWO places — the Account section's read-only
    // Email field, and the Change email section's "Your current email is X"
    // preamble. Either match confirms the Account section rendered.
    expect(screen.getAllByText('ahf.ivan@gmail.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Eventar Staff')).toBeTruthy();
  });

  it('renders "Organiser" for an organiser_member role', () => {
    render(<SettingsClient staff={{ email: 'org@x.com', role: 'organiser_member' }} />);
    expect(screen.getByText('Organiser')).toBeTruthy();
  });

  // Sign-out does NOT render here — it lives once, in the page's dedicated
  // "Session" section via SettingsSignOut below. Two separate Sign-out
  // buttons rendered on the real /settings page before this session (one
  // here, one on the page itself); this asserts the Account section stays
  // free of it so the duplicate can't silently come back.
  it('does not render a Sign out control inside Account', () => {
    render(<SettingsClient staff={STAFF} />);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe('SettingsSignOut', () => {
  // The click → supabaseBrowser().auth.signOut() → redirect wiring is a
  // straight pass-through into SignOutAction's own signOut prop (same shape
  // MagicLinkSignInForm's submitMagicLink already proves out elsewhere in
  // this codebase); what's specific to THIS component, and what regressed
  // before, is that it renders — exactly once, in one place.
  it('renders the sign-out control', () => {
    render(<SettingsSignOut />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});

describe('SettingsClient — Change email section (organizer)', () => {
  it('renders the current email in the intro copy', () => {
    render(<SettingsClient staff={STAFF} />);
    expect(screen.getByRole('heading', { name: /change email/i })).toBeInTheDocument();
    // The current-email display appears both inside the Account section (as
    // the read-only Email field) and inside the change-email intro copy; the
    // test just needs one match to confirm the current address is present.
    expect(screen.getAllByText(STAFF.email).length).toBeGreaterThan(0);
  });

  it('submits with next=/settings and clears the input on success', async () => {
    vi.mocked(changeEmail).mockResolvedValueOnce({
      ok: true as const,
      data: { sent: true as const, new_email: 'new@example.com' },
    });
    render(<SettingsClient staff={STAFF} />);
    const input = screen.getByLabelText(/new email/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send confirmation/i }));
    });
    expect(changeEmail).toHaveBeenCalledWith('new@example.com', '/settings');
    expect(input.value).toBe('');
    expect(screen.getByText(/confirmation sent to new@example\.com/i)).toBeInTheDocument();
  });
});
