// scripts/demo/lib.ts — clients for the LOCAL Supabase stack only.
// Refuses anything that isn't 127.0.0.1/localhost: the remote (Seoul) ledger is
// append-only by design, so demo rows written there would be permanent residue.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

let cached: { url: string; anon: string; service: string } | null = null;

export function localEnv() {
  if (cached) return cached;
  const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)`, 'm'))?.[1];
  const url = get('API_URL');
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Refusing non-local stack: ${url ?? 'no API_URL from supabase status'}`);
  }
  cached = { url, anon: get('ANON_KEY')!, service: get('SERVICE_ROLE_KEY')! };
  return cached;
}

// psql against the local stack's container. `sql` is authored by our demo
// scripts, never user input; execFileSync with array args = no shell.
export function psqlLocal(sql: string): string {
  localEnv(); // asserts the local stack is the target before touching the container
  return execFileSync(
    'docker',
    ['exec', 'supabase_db_Eventar', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql],
    { encoding: 'utf8', timeout: 20_000 },
  ).trim();
}

export const admin = () => {
  const e = localEnv();
  return createClient(e.url, e.service, { auth: { persistSession: false } });
};

export const anonClient = () => {
  const e = localEnv();
  return createClient(e.url, e.anon, { auth: { persistSession: false } });
};

export async function signedInClient(email: string, password: string) {
  const e = localEnv();
  const c = createClient(e.url, e.anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
