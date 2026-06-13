/**
 * Client-side text-size persistence. Three modes:
 *   - 'small'   → --text-scale: 0.875
 *   - 'default' → --text-scale: 1 (no class)
 *   - 'large'   → --text-scale: 1.125
 *
 * Stored in localStorage; applied by toggling .text-small / .text-large
 * classes on <html>. globals.css defines the variable; the M3 typography
 * tokens (text-headline-lg, text-body-md, etc.) multiply against it.
 *
 * Caveat: components that use arbitrary text-[Npx] literals (instead of
 * M3 tokens) won't scale until they're migrated. Visible in practice on
 * a handful of icon spans and Phase-6.5 cards.
 *
 * FOUC prevention: an inline script in app/layout.tsx applies the class
 * synchronously before React hydrates.
 */
export type TextSize = 'small' | 'default' | 'large';

export const TEXT_SIZE_STORAGE_KEY = 'eventar-text-size';

export function isTextSize(value: unknown): value is TextSize {
  return value === 'small' || value === 'default' || value === 'large';
}

export function readTextSize(): TextSize {
  if (typeof window === 'undefined') return 'default';
  // Safari "Block all cookies" and iOS private mode throw on storage access.
  try {
    const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(stored) ? stored : 'default';
  } catch {
    return 'default';
  }
}

export function applyTextSize(size: TextSize): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('text-small', 'text-large');
  if (size === 'small') root.classList.add('text-small');
  if (size === 'large') root.classList.add('text-large');
}

export function writeTextSize(size: TextSize): void {
  if (typeof window === 'undefined') return;
  // Apply the class FIRST so the in-tab UI flips even when persistence fails
  // (private mode / locked browser). The pick will revert to default on the
  // next visit, which is the correct user-visible behavior for a UI
  // preference that can't be stored.
  applyTextSize(size);
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Best-effort persistence; in-tab UI already reflects the pick.
  }
}
