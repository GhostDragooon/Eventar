import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// UX-04 / O6: Registrations is the list you manage, Check-in is the live door. A control called "Roster"
// (or "Open roster") must not exist, because the only thing it could land on is the check-in desk.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'dev-preview-uiport' ? [] : sources(p);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe('no control is labelled Roster', () => {
  it('has no JSX label or aria-label reading Roster / Open roster in app/ or components/', () => {
    const hits = [...sources('app'), ...sources('components')].filter((f) =>
      /(>\s*(Open )?roster\s*(→|<)|aria-label="[^"]*\broster\b)/i.test(readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });
});
