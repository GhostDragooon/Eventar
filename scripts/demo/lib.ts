// scripts/demo/lib.ts — clients for the LOCAL Supabase stack only.
// Refuses anything that isn't 127.0.0.1/localhost: the remote (Seoul) ledger is
// append-only by design, so demo rows written there would be permanent residue.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { Client as PgClient } from 'pg';

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

// Superuser SQL against the LOCAL stack's Postgres (port 54322) via a direct
// connection — NOT via `docker exec`: nested child processes can't reach the
// docker socket in some sandboxed harnesses (spawnSync docker ETIMEDOUT,
// verified 2026-07-12), while a plain TCP connection works everywhere
// (harness, terminal, CI). `sql` is authored by our demo scripts, never user
// input. Superuser access exists only on the local stack — which is the point:
// the tamper demo needs a power that hosted environments rightly deny.
export async function sqlLocal(sql: string): Promise<string> {
  localEnv(); // asserts the local stack is the target
  const c = new PgClient({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await c.connect();
  try {
    const res = await c.query(sql);
    return res.rows.map((r) => Object.values(r).join('|')).join('\n');
  } finally {
    await c.end();
  }
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
