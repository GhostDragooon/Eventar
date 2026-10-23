import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cn } from './utils';

// The project's own type scale (app/globals.css `--text-*`) is registered as font sizes. Without that,
// tailwind-merge reads `text-label-md` as a text COLOUR, so it evicts a real colour class in either order
// (CX-03: 15 of 32 type-scaled buttons rendered dark text on blue at 3.82:1).
describe('cn type-scale tokens', () => {
  it('keeps a size token and a colour when the colour comes after', () => {
    expect(cn('text-label-md', 'text-on-primary')).toBe('text-label-md text-on-primary');
  });

  it('keeps a size token and a colour when the colour comes before', () => {
    expect(cn('text-on-primary', 'text-label-md')).toBe('text-on-primary text-label-md');
  });

  it('keeps both for every token in the scale', () => {
    for (const t of ['display', 'headline-lg', 'headline-md', 'headline-sm', 'title-lg', 'body-lg', 'body-md', 'body-sm', 'label-md', 'label-sm']) {
      expect(cn(`text-${t}`, 'text-primary-ink')).toBe(`text-${t} text-primary-ink`);
    }
  });

  it('still lets a later size replace an earlier size', () => {
    expect(cn('text-label-md', 'text-body-lg')).toBe('text-body-lg');
    expect(cn('text-sm', 'text-body-lg')).toBe('text-body-lg');
  });

  it('still lets a later colour replace an earlier colour', () => {
    expect(cn('text-on-primary', 'text-primary-ink')).toBe('text-primary-ink');
    expect(cn('text-label-md text-on-primary', 'text-primary-ink')).toBe('text-label-md text-primary-ink');
  });

  // The list in lib/utils.ts is a copy of the `--text-*` tokens in app/globals.css. A token added there and
  // not registered would silently evict a text colour again (the failure CX-03 fixed), so read the CSS.
  it('registers every `--text-*` size token that app/globals.css defines', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const tailwindOwn = new Set(['xs', 'sm', 'base', 'lg', 'xl', 'scale']);
    const tokens = [...css.matchAll(/^\s*--text-([a-z]+(?:-[a-z]+)?)\s*:/gm)].map((m) => m[1]).filter((n) => !tailwindOwn.has(n));
    expect(tokens.length).toBeGreaterThanOrEqual(10);
    for (const name of new Set(tokens)) {
      expect(cn(`text-${name}`, 'text-primary-ink'), `text-${name} is not registered in lib/utils.ts`).toBe(`text-${name} text-primary-ink`);
    }
  });

  // tailwind-merge treats a font size as conflicting with an earlier `leading-*`. Registering our sizes brings
  // them under that rule, so a size AFTER a leading drops the leading and the other order keeps both. No call
  // site relied on it (review CX-03 MINOR-3); this pins the behaviour so a change is deliberate.
  it('lets a type token override an earlier leading class, and keeps both the other way round', () => {
    expect(cn('leading-snug', 'text-label-md')).toBe('text-label-md');
    expect(cn('text-label-md', 'leading-snug')).toBe('text-label-md leading-snug');
  });
});
