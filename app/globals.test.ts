// Dark-mode token parity — app/globals.css.
//
// The dark palette is declared twice and kept in sync by hand: under the
// system-dark media query (:root:not(.light) — what a user who picked
// Theme = "System" gets on a dark OS) and under :root.dark (an explicit "Dark"
// pick). Nothing but this test stops one drifting from the other. It did once:
// Q32 added --primary-ink to :root.dark only, so System-theme users on a dark
// OS kept the light-mode ink (2.0:1 on the dark ground) on every
// text-primary-ink. A property missing from one block silently falls back to
// the :root light value, so tsc, eslint and the build all stay green.
//
// Compares every declaration (custom properties and color-scheme), names and
// values, so a changed value fails the same way a missing token does.
// Runs under vitest, no DB.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Comments go first: the blocks carry prose with colons and token names in it.
// Neither block nests rules, so [^{}]* is the whole body.
const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const SYSTEM_DARK = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\.light\)\s*\{([^{}]*)\}/g;
const EXPLICIT_DARK = /:root\.dark\s*\{([^{}]*)\}/g;

function declarations(block: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, body] of css.matchAll(block)) {
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':');
      // Hex case is not meaning; everything else is compared as written.
      if (colon > 0) out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim().toLowerCase();
    }
  }
  return out;
}

describe('globals.css dark-mode token parity', () => {
  const system = declarations(SYSTEM_DARK);
  const explicit = declarations(EXPLICIT_DARK);

  // Not vacuous: an extractor that matched nothing (or the wrong rule) would
  // compare {} to {} and pass.
  it('finds both blocks and both switch native UI to dark', () => {
    expect(system['color-scheme']).toBe('dark');
    expect(explicit['color-scheme']).toBe('dark');
  });

  it('system-dark block and :root.dark declare identical tokens and values', () => {
    expect(
      system,
      'system-dark block (received) differs from :root.dark (expected) — mirror every token change into both',
    ).toEqual(explicit);
  });
});
