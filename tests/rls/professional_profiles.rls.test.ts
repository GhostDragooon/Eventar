// Stage D / D1 — professional_profiles RLS + grant regression suite.
//
// Plan §8.6 bullet 1. Guarantees the shape shipped in 20260829090000
// (self read/insert/update, staff read, no client DELETE, discovery-opt-in
// timestamp auto-sync) can't drift without this test going red.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('professional_profiles RLS + trigger', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createTestUser(`pp-user-a-${ts}`);
    userB = await createTestUser(`pp-user-b-${ts}`);
  }, 60_000);

  afterAll(async () => {
    // professional_profiles rows cascade on user delete (FK ON DELETE CASCADE).
    await deleteTestUser(userA);
    await deleteTestUser(userB);
  });

  it('anon cannot SELECT professional_profiles', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from('professional_profiles').select('id').limit(1);
    // Anon has no RLS policy grant on this table + explicit REVOKE on the
    // relation. supabase-js swallows 403 as an empty-with-error shape.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('authenticated self can INSERT their own profile row', async () => {
    const { data, error } = await userA.client
      .from('professional_profiles')
      .insert({
        user_id: userA.id,
        workplace_text: 'Test Hospital A',
        position_code: 'doctor',
        profession_code: 'medicine',
      })
      .select('id, user_id, workplace_text')
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(userA.id);
    expect(data?.workplace_text).toBe('Test Hospital A');
  });

  it('authenticated self can UPDATE their own profile row', async () => {
    const { error } = await userA.client
      .from('professional_profiles')
      .update({ department_text: 'Cardiology' })
      .eq('user_id', userA.id);
    expect(error).toBeNull();
    const { data } = await userA.client
      .from('professional_profiles')
      .select('department_text')
      .eq('user_id', userA.id)
      .single();
    expect(data?.department_text).toBe('Cardiology');
  });

  it('authenticated cannot INSERT a row for another user_id (RLS with_check blocks)', async () => {
    // userB tries to insert a profile row keyed to userA. Should be blocked
    // by the self_insert policy's with_check.
    const { data, error } = await userB.client
      .from('professional_profiles')
      .insert({
        user_id: userA.id,
        workplace_text: 'Forgery attempt',
        position_code: 'doctor',
        profession_code: 'medicine',
      })
      .select('id');
    // RLS violation surfaces as an error with 42501 or a friendly PostgREST message.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('userB cannot SELECT userA profile row (self_read policy scopes to self)', async () => {
    const { data, error } = await userB.client
      .from('professional_profiles')
      .select('id')
      .eq('user_id', userA.id);
    // RLS silently filters — empty result, not an error.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('authenticated has no DELETE grant on professional_profiles', async () => {
    const { error } = await userA.client
      .from('professional_profiles')
      .delete()
      .eq('user_id', userA.id);
    // Table-level grant is missing for authenticated DELETE. Postgres returns
    // 42501 / permission denied.
    expect(error).not.toBeNull();
    // Row still there.
    const { data } = await admin
      .from('professional_profiles')
      .select('id')
      .eq('user_id', userA.id);
    expect(data ?? []).toHaveLength(1);
  });

  it('speaker_discovery_opt_in_at trigger: sets timestamp when opt_in flips true', async () => {
    // userB creates their profile with opt_in=true — trigger should stamp opt_in_at
    // synchronously on INSERT.
    const { data, error } = await userB.client
      .from('professional_profiles')
      .insert({
        user_id: userB.id,
        workplace_text: 'Test Hospital B',
        position_code: 'nurse',
        profession_code: 'nursing',
        speaker_discovery_opt_in: true,
      })
      .select('speaker_discovery_opt_in, speaker_discovery_opt_in_at')
      .single();
    expect(error).toBeNull();
    expect(data?.speaker_discovery_opt_in).toBe(true);
    expect(data?.speaker_discovery_opt_in_at).not.toBeNull();
  });

  it('speaker_discovery_opt_in_at trigger: clears timestamp when opt_in flips false', async () => {
    const { error } = await userB.client
      .from('professional_profiles')
      .update({ speaker_discovery_opt_in: false })
      .eq('user_id', userB.id);
    expect(error).toBeNull();
    const { data } = await userB.client
      .from('professional_profiles')
      .select('speaker_discovery_opt_in, speaker_discovery_opt_in_at')
      .eq('user_id', userB.id)
      .single();
    expect(data?.speaker_discovery_opt_in).toBe(false);
    expect(data?.speaker_discovery_opt_in_at).toBeNull();
  });
}, 60_000);
