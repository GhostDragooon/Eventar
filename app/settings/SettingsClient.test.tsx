/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Avoid pulling 'server-only' (via SignOutButton → supabase browser client) in
// jsdom; we only assert that the Sign-out button renders, not its action.
vi.mock('@/components/shell/SignOutButton', () => ({
  SignOutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>Sign Out</button>
  ),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsClient from './SettingsClient';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { TEXT_SIZE_STORAGE_KEY } from '@/lib/textSize';

afterEach(cleanup);

const STAFF = { email: 'ahf.ivan@gmail.com', role: 'manager' as const };

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
    expect(screen.getByText('Manager')).toBeTruthy();
  });

  it('renders Organizer (capitalized) for an organizer role', () => {
    render(<SettingsClient staff={{ email: 'org@x.com', role: 'organizer' }} />);
    expect(screen.getByText('Organizer')).toBeTruthy();
  });

  it('renders the Sign Out action', () => {
    render(<SettingsClient staff={STAFF} />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });
});
