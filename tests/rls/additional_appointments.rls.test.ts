// WP-B — additional_appointments RLS regression suite.
//
// Plan Phase 7. Self CRUD (including delete — unlike professional_profiles,
// this is a genuine repeatable-row surface with a product need for delete),
// staff read, no cross-user access.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('additional_appointments RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createTestUser(`appt-user-a-${ts}`);
    userB = await createTestUser(`appt-user-b-${ts}`);
  }, 60_000);

  afterAll(async () => {
    await deleteTestUser(userA);
    await deleteTestUser(userB);
  });

  it('anon cannot SELECT additional_appointments', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from('additional_appointments').select('id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('authenticated self can INSERT their own appointment row', async () => {
    const { data, error } = await userA.client
      .from('additional_appointments')
      .insert({ user_id: userA.id, institution_name: 'Test Institution', title: 'Visiting Fellow' })
      .select('id, user_id')
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(userA.id);
  });

  it('authenticated cannot INSERT a row for another user_id', async () => {
    const { data, error } = await userB.client
      .from('additional_appointments')
      .insert({ user_id: userA.id, institution_name: 'Forgery', title: 'x' })
      .select('id');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('userB cannot SELECT userA appointment rows', async () => {
    const { data, error } = await userB.client
      .from('additional_appointments')
      .select('id')
      .eq('user_id', userA.id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('authenticated self can DELETE their own appointment row', async () => {
    const { data: inserted } = await userA.client
      .from('additional_appointments')
      .insert({ user_id: userA.id, institution_name: 'Delete Me', title: 'x' })
      .select('id')
      .single();
    const { error } = await userA.client.from('additional_appointments').delete().eq('id', inserted!.id);
    expect(error).toBeNull();
    const { data: check } = await admin.from('additional_appointments').select('id').eq('id', inserted!.id);
    expect(check ?? []).toHaveLength(0);
  });

  it('userB cannot DELETE userA appointment row', async () => {
    const { data: inserted } = await userA.client
      .from('additional_appointments')
      .insert({ user_id: userA.id, institution_name: 'Protect Me', title: 'x' })
      .select('id')
      .single();
    const { error } = await userB.client.from('additional_appointments').delete().eq('id', inserted!.id);
    // RLS filters the row out of userB's visible set, so the delete affects
    // zero rows — not necessarily a surfaced error. Assert on the actual data.
    void error;
    const { data: check } = await admin.from('additional_appointments').select('id').eq('id', inserted!.id);
    expect(check ?? []).toHaveLength(1);
  });
}, 60_000);
