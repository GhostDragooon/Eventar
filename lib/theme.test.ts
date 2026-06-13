/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyTheme, readTheme, writeTheme, isTheme } from './theme';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('light', 'dark');
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('light', 'dark');
});

describe('isTheme', () => {
  it('accepts the three valid modes and rejects anything else', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
    expect(isTheme('hot-pink')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('readTheme', () => {
  it('returns "system" when nothing is stored', () => {
    expect(readTheme()).toBe('system');
  });

  it('returns the stored value when it is a valid theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readTheme()).toBe('dark');
  });

  it('falls back to "system" when localStorage holds a garbage value', () => {
    // Defends against a hand-edited value or a future schema change.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'hot-pink');
    expect(readTheme()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('adds the "dark" class for theme "dark"', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('adds the "light" class for theme "light"', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('removes both classes for theme "system"', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('replaces, not appends — switching dark→light leaves only "light"', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});

describe('writeTheme', () => {
  it('persists the choice AND applies the class atomically', () => {
    writeTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
