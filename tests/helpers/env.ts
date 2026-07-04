// Loads .env.local into process.env for integration tests (vitest does not
// load Next's env files). No new dependency: minimal parser, KEY=VALUE
// lines only, no quoting/expansion — matches how this repo's .env.local
// is written.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvLocal(): void {
  const path = resolve(__dirname, '../../.env.local');
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}
