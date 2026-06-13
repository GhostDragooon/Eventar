/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TEXT_SIZE_STORAGE_KEY,
  applyTextSize,
  isTextSize,
  readTextSize,
  writeTextSize,
} from './textSize';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('text-small', 'text-large');
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('text-small', 'text-large');
});

describe('isTextSize', () => {
  it('accepts the three valid sizes and rejects everything else', () => {
    expect(isTextSize('small')).toBe(true);
    expect(isTextSize('default')).toBe(true);
    expect(isTextSize('large')).toBe(true);
    expect(isTextSize('huge')).toBe(false);
    expect(isTextSize(null)).toBe(false);
  });
});

describe('readTextSize', () => {
  it('returns "default" when nothing is stored', () => {
    expect(readTextSize()).toBe('default');
  });

  it('returns the stored value when valid', () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'large');
    expect(readTextSize()).toBe('large');
  });

  it('falls back to "default" for a garbage value', () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'huge');
    expect(readTextSize()).toBe('default');
  });
});

describe('applyTextSize', () => {
  it('adds "text-small" for size "small"', () => {
    applyTextSize('small');
    expect(document.documentElement.classList.contains('text-small')).toBe(true);
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
  });

  it('adds "text-large" for size "large"', () => {
    applyTextSize('large');
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
    expect(document.documentElement.classList.contains('text-small')).toBe(false);
  });

  it('removes both classes for size "default"', () => {
    applyTextSize('large');
    applyTextSize('default');
    expect(document.documentElement.classList.contains('text-small')).toBe(false);
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
  });

  it('replaces, not appends — large→small leaves only "text-small"', () => {
    applyTextSize('large');
    applyTextSize('small');
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
    expect(document.documentElement.classList.contains('text-small')).toBe(true);
  });
});

describe('writeTextSize', () => {
  it('persists and applies atomically', () => {
    writeTextSize('large');
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe('large');
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
  });
});
