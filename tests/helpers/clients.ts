// Test clients + fixture users for real-DB integration tests.
// Service-role client sets up fixtures (BYPASSRLS); per-user anon clients
// authenticate with password sign-in to probe RLS as real JWTs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './env';

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = {
  email: string;
  id: string;
  client: SupabaseClient;
};

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
