/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsClient from './SettingsClient';
import { THEME_STORAGE_KEY } from '@/lib/theme';

// vitest has no globals here.
afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('light', 'dark');
});

describe('SettingsClient — Appearance', () => {
  it('renders the three theme options with their descriptions', () => {
    render(<SettingsClient />);
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText(/operating-system preference/i)).toBeTruthy();
  });

  it('reflects the persisted theme on mount (dark)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<SettingsClient />);
    const radio = screen.getByRole('radio', { name: /dark/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('persists + applies the class when a new theme is picked', () => {
    render(<SettingsClient />);
    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clears the class when "System" is picked', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark');
    render(<SettingsClient />);
    fireEvent.click(screen.getByRole('radio', { name: /system/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});
