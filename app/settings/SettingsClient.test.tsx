/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsClient, { SettingsSignOut } from './SettingsClient';
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
    expect(screen.getByText('ahf.ivan@gmail.com')).toBeTruthy();
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
