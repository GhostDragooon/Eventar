// Test clients + fixture users for real-DB integration tests.
// Service-role client sets up fixtures (BYPASSRLS); per-user anon clients
// authenticate with password sign-in to probe RLS as real JWTs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import { loadEnvLocal } from './env';

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Hard guard, found 2026-08-14: this suite (tests/rls, tests/audit,
// tests/cron, plus the two whitelisted tests/cpd/ files) writes real rows —
// two of the cpd files post PERMANENT, undeletable credit_ledger entries by
// design (see docs/DEFERRED.md). `.env.local` in this repo has pointed at the
// live Seoul project before; every test file imports its client from here, so
// this is the one place that can refuse to run before any client is even
// created, rather than relying on every future session remembering to check.
// Gated on RLS_TESTS — the exact condition every file's own
// `describe.skipIf(!process.env.RLS_TESTS)` already uses — because this
// module is imported unconditionally even by a bare `vitest run` that means
// to skip these files entirely; an ungated throw here would turn a graceful
// skip into a hard failure for every other test file, not just gate a real
// RLS_TESTS=1 run. Matches on 127.0.0.1/localhost — the only two forms the
// local stack's `supabase status -o env` API_URL ever takes.
if (process.env.RLS_TESTS && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) {
  throw new Error(
    `tests/helpers/clients.ts: NEXT_PUBLIC_SUPABASE_URL is "${url}", which is not the local stack. ` +
      'This suite writes permanent, undeletable rows and must never run against a hosted project. ' +
      'Point .env.local at the local stack, or export NEXT_PUBLIC_SUPABASE_URL from `supabase status -o env` before running test:rls.',
  );
}

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = {
  email: string;
  id: string;
  client: SupabaseClient;
};

export function createAnonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const PASSWORD = 'rls-test-Password-1234!';

export async function createTestUser(localPart: string): Promise<TestUser> {
  const email = `${localPart}@rls-test.invalid`;
  // Idempotent: delete any leftover from a crashed previous run.
  const { data: existing } = await admin.auth.admin.listUsers();
  const leftover = existing?.users.find((u) => u.email === email);
  if (leftover) await admin.auth.admin.deleteUser(leftover.id);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);

  return { email, id: data.user.id, client };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  await user.client.auth.signOut();
  await admin.auth.admin.deleteUser(user.id); // cascades public.users
}

// Direct superuser connection to the LOCAL Postgres, bypassing PostgREST and
// its role grants entirely — needed only for fixtures against definer-only
// tables that have no INSERT-capable RPC yet (e.g. event_occurrences: its
// sole writer is the events-insert trigger; C2 doesn't add an
// organiser-facing occurrence RPC, that's C5). `admin` (the service_role
// Supabase client) can't do this — event_occurrences table-level REVOKEs
// service_role INSERT/UPDATE/DELETE by design (Hard Rule 11).
// Mirrors scripts/demo/lib.ts's sqlLocal(): same hardcoded local connection
// string, same reasoning. Safe to hardcode here specifically because the
// module-load guard above already refuses to load this file at all when
// RLS_TESTS is set against a non-local URL — this helper is unreachable
// against a hosted project.
export async function sqlSuperuser(sql: string): Promise<void> {
  const c = new PgClient({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}
