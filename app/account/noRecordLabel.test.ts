import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Ivan 2026-11-02: one word for the attendee's attendance log, "History". The menu item, the doors, the
// sign-up page and the History page body must not call it "Record" / "your record" / "your Eventar record".
// Marketing keeps "Eventar record" (app/page.tsx, components/landing), the credit chip says "On record"
// (a credit status, not the page name), and the route path is still /account/record: none of those trip this.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'dev-preview-uiport' ? [] : sources(p);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [p] : [];
  });
}
// Only user-visible text: drop block comments and whole-line // comments.
const visible = (f: string) =>
  readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const all = [...sources('app'), ...sources('components')];
// Surfaces where "Eventar record" would name the attendee log (marketing lives elsewhere and is exempt).
const inProduct = (f: string) => /^(app\/(account|login)\/|components\/(auth|ui|shell)\/|components\/RegisterCard\.tsx)/.test(f);

describe('the attendee attendance log is called History', () => {
  it('has no "Record" menu/link label and no "my record" / "your record" copy in app/ or components/', () => {
    const hits = all.filter((f) => /(label:\s*['"]Record['"]|<(Link|a|button)\b[^>]*>\s*Record\s*<\/|\b(my|your) record\b)/i.test(visible(f)));
    expect(hits).toEqual([]);
  });

  it('does not call it "Eventar record" in product surfaces (marketing is exempt)', () => {
    const hits = all.filter((f) => inProduct(f) && /Eventar record/i.test(visible(f)));
    expect(hits).toEqual([]);
  });
});
