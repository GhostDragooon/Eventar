#!/usr/bin/env node
// Fails when a handoff doc does not end with the three mandatory closing steps, in order:
//   Closing: repo graph done (<date>) · vault note done (<path>) · vault graph done (<date>)
// Usage: node scripts/check-handoff.mjs [files...]   (no args: handoffs staged in git)
// ponytail: only handoffs dated >= 20261114 are checked (older ones predate the rule). Raise/remove the floor if that changes.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FLOOR = 20261114;
const LINE = /^Closing:\s*repo graph done\b.*\bvault note done\b.*\bvault graph done\b/i;
const staged = () =>
  execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=AM'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = (process.argv.length > 2 ? process.argv.slice(2) : staged()).filter((f) => {
  const m = f.match(/docs\/plans\/handoff_(\d{8})-.*\.md$/) ?? f.match(/(?:^|\/)handoff_(\d{8})-.*\.md$/);
  return m && Number(m[1]) >= FLOOR;
});

let bad = 0;
for (const f of files) {
  const last = readFileSync(f, 'utf8').trimEnd().split('\n').pop() ?? '';
  if (!LINE.test(last)) {
    bad++;
    console.error(`HANDOFF NOT COMPLETE: ${f}\n  last line must be: Closing: repo graph done (<date>) · vault note done (<path>) · vault graph done (<date>)\n  got: ${last.slice(0, 120)}`);
  }
}
if (!bad) console.log(`check-handoff: ${files.length} handoff(s) checked, all closed.`);
process.exit(bad ? 1 : 0);
