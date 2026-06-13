/**
 * Client-side theme persistence. Three modes:
 *   - 'light'  → force light, ignores OS
 *   - 'dark'   → force dark, ignores OS
 *   - 'system' → follow prefers-color-scheme (the default)
 *
 * Persisted in localStorage; applied by toggling .light/.dark classes on
 * <html>. The CSS in globals.css does the rest (class selectors override
 * the prefers-color-scheme media query).
 *
 * FOUC prevention: an inline script in app/layout.tsx reads this key
 * synchronously and applies the class before React hydrates.
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'eventar-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'system';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme !== 'system') root.classList.add(theme);
}

export function writeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}
