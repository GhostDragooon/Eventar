// Sprint 1 RLS probes against the live dev project, as real JWTs.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('foundations RLS', () => {
  let alice: TestUser;
  let bob: TestUser;
  let staffUser: TestUser; // granted eventar_staff via fixture row

  beforeAll(async () => {
    alice = await createTestUser('alice');
    bob = await createTestUser('bob');
    staffUser = await createTestUser('opstaff');
    const { error } = await admin.from('staff').insert({
      email: staffUser.email,
      role: 'eventar_staff',
      full_name: 'RLS Test Operator',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture: ${error.message}`);
  }, 60_000);

  afterAll(async () => {
    await mustDelete(admin.from('staff').delete().eq('email', staffUser.email), 'staff fixture');
    for (const u of [alice, bob, staffUser]) if (u) await deleteTestUser(u);
  }, 60_000);

  // ---- users mirror ----
  it('handle_new_user mirrored the test users into public.users', async () => {
    const { data } = await admin
      .from('users')
      .select('id')
      .in('id', [alice.id, bob.id]);
    expect(data).toHaveLength(2);
  });

  it('alice reads her own users row', async () => {
    const { data, error } = await alice.client
      .from('users')
      .select('id, full_name')
      .eq('id', alice.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(alice.id);
  });

  it('alice cannot read bob’s users row (filtered, not errored)', async () => {
    const { data, error } = await alice.client
      .from('users')
      .select('id')
      .eq('id', bob.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('alice updates her own full_name', async () => {
    const { data, error } = await alice.client
      .from('users')
      .update({ full_name: 'Alice Chan' })
      .eq('id', alice.id)
      .select('full_name')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.full_name).toBe('Alice Chan');
  });

  it('alice cannot update bob (RLS-silent-fail guard: zero rows)', async () => {
    const { data, error } = await alice.client
      .from('users')
      .update({ full_name: 'hacked' })
      .eq('id', bob.id)
      .select('id')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('eventar_staff reads all users', async () => {
    const { data, error } = await staffUser.client
      .from('users')
      .select('id')
      .in('id', [alice.id, bob.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  // ---- organisations ----
  it('non-staff alice sees no organisations', async () => {
    const { data } = await alice.client.from('organisations').select('id');
    expect(data).toHaveLength(0);
  });

  it('eventar_staff reads the default organisation', async () => {
    const { data } = await staffUser.client
      .from('organisations')
      .select('slug')
      .eq('id', DEFAULT_ORG)
      .maybeSingle();
    expect(data?.slug).toBe('default');
  });

  // ---- consent ----
  it('alice records and reads her own consent', async () => {
    const { error: insertError } = await alice.client
      .from('consent_records')
      .insert({
        user_id: alice.id,
        consent_type: 'terms_of_service',
        version: 'test-1.0',
      });
    expect(insertError).toBeNull();
    const { data } = await alice.client
      .from('consent_records')
      .select('version')
      .eq('user_id', alice.id);
    expect(data).toHaveLength(1);
  });

  it('alice cannot insert consent for bob (42501)', async () => {
    const { error } = await alice.client.from('consent_records').insert({
      user_id: bob.id,
      consent_type: 'marketing',
      version: 'test-1.0',
    });
    expect(error?.code).toBe('42501');
  });

  // ---- DSR ----
  it('bob files a DSR and reads it back; alice cannot see it', async () => {
    const { error: insertError } = await bob.client
      .from('data_subject_requests')
      .insert({ subject_user_id: bob.id, request_type: 'access' });
    expect(insertError).toBeNull();

    const { data: bobSees } = await bob.client
      .from('data_subject_requests')
      .select('id')
      .eq('subject_user_id', bob.id);
    expect(bobSees).toHaveLength(1);

    const { data: aliceSees } = await alice.client
      .from('data_subject_requests')
      .select('id')
      .eq('subject_user_id', bob.id);
    expect(aliceSees).toHaveLength(0);
  });

  // ---- audit_events ----
  it('non-staff alice sees no audit events', async () => {
    const { data } = await alice.client.from('audit_events').select('id');
    expect(data).toHaveLength(0);
  });

  it('alice cannot insert into audit_events directly (42501)', async () => {
    const { error } = await alice.client.from('audit_events').insert({
      event_type: 'forged',
      prev_hash: 'x',
      hash: 'x',
    });
    expect(error?.code).toBe('42501');
  });

  // ---- pseudonymise_user ----
  it('non-staff alice cannot pseudonymise bob (42501)', async () => {
    const { error } = await alice.client.rpc('pseudonymise_user', {
      p_user_id: bob.id,
      p_reason: 'malicious',
    });
    expect(error?.code).toBe('42501');
  });

  it('eventar_staff pseudonymises bob; audit row written in-transaction', async () => {
    const { error } = await staffUser.client.rpc('pseudonymise_user', {
      p_user_id: bob.id,
      p_reason: 'rls-test erasure',
    });
    expect(error).toBeNull();

    const { data: bobRow } = await admin
      .from('users')
      .select('full_name, pseudonymised_at')
      .eq('id', bob.id)
      .single();
    expect(bobRow?.full_name).toMatch(/^ERASED-[0-9a-f]{12}$/);
    expect(bobRow?.pseudonymised_at).not.toBeNull();

    const { data: auditRow } = await admin
      .from('audit_events')
      .select('event_type, subject_id, payload')
      .eq('event_type', 'user_pseudonymised')
      .eq('subject_id', bob.id)
      .maybeSingle();
    expect(auditRow).not.toBeNull();
    expect((auditRow?.payload as { reason?: string })?.reason).toBe(
      'rls-test erasure',
    );
  });
});
