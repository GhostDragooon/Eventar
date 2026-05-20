import { describe, expect, it } from 'vitest';
import { slugifyTitle } from './slugify';

describe('slugifyTitle', () => {
  it('lowercases and replaces non-alphanumerics with single dash', () => {
    expect(slugifyTitle('Internal Workshop 2026')).toBe('internal-workshop-2026');
  });

  it('trims leading/trailing whitespace + collapses interior runs', () => {
    expect(slugifyTitle('  Hello   World!  ')).toBe('hello-world');
  });

  it('strips leading/trailing dashes', () => {
    expect(slugifyTitle('!!Title!!')).toBe('title');
  });

  it('returns empty string for symbols-only input (caller falls back to id)', () => {
    expect(slugifyTitle('!!!')).toBe('');
    expect(slugifyTitle('   ')).toBe('');
    expect(slugifyTitle('')).toBe('');
  });

  it('caps at 60 chars, truncating at the last full word boundary if possible', () => {
    const longTitle = 'a'.repeat(70);
    expect(slugifyTitle(longTitle)).toHaveLength(60);
    const multiWord = 'one two three four five six seven eight nine ten eleven twelve';
    const result = slugifyTitle(multiWord);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles unicode by stripping it (ASCII-only output)', () => {
    expect(slugifyTitle('Café—Tokyo')).toBe('caf-tokyo');
  });
});
