// WP-B — society_memberships RLS regression suite.
//
// Plan Phase 7. Self CRUD, staff read, no cross-user access, unique
// (user_id, society_code) enforced.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('society_memberships RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createTestUser(`soc-user-a-${ts}`);
    userB = await createTestUser(`soc-user-b-${ts}`);
  }, 60_000);

  afterAll(async () => {
    await deleteTestUser(userA);
    await deleteTestUser(userB);
  });

  it('anon cannot SELECT society_memberships', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from('society_memberships').select('id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('authenticated self can INSERT their own membership row', async () => {
    const { data, error } = await userA.client
      .from('society_memberships')
      .insert({ user_id: userA.id, society_code: 'HKCS', role_title: 'Fellow' })
      .select('id, user_id')
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(userA.id);
  });

  it('authenticated cannot INSERT a row for another user_id', async () => {
    const { data, error } = await userB.client
      .from('society_memberships')
      .insert({ user_id: userA.id, society_code: 'HKMA' })
      .select('id');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('unique (user_id, society_code) rejects a duplicate membership', async () => {
    const { error } = await userA.client
      .from('society_memberships')
      .insert({ user_id: userA.id, society_code: 'HKCS' });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('userB cannot SELECT userA membership rows', async () => {
    const { data, error } = await userB.client
      .from('society_memberships')
      .select('id')
      .eq('user_id', userA.id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('authenticated self can DELETE their own membership row', async () => {
    const { data: inserted } = await userA.client
      .from('society_memberships')
      .insert({ user_id: userA.id, society_code: 'HKMA' })
      .select('id')
      .single();
    const { error } = await userA.client.from('society_memberships').delete().eq('id', inserted!.id);
    expect(error).toBeNull();
    const { data: check } = await admin.from('society_memberships').select('id').eq('id', inserted!.id);
    expect(check ?? []).toHaveLength(0);
  });
}, 60_000);
