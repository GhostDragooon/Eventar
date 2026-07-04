// Sprint 2 / Task 8 — record_session_revocation service_role-only RLS +
// audit probes against the live dev project, as real JWTs.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

describe.skipIf(!process.env.RLS_TESTS)('record_session_revocation RLS', () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('session-revocation-alice');
  }, 60_000);

  afterAll(async () => {
    if (alice) await deleteTestUser(alice);
  }, 60_000);

  it('authenticated (non-service-role) caller is denied (42501)', async () => {
    const { data, error } = await alice.client.rpc('record_session_revocation', {
      p_user_id: alice.id,
      p_reason: 'test',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // PostgREST surfaces a function-permission denial (42501 / "permission denied for function")
    expect(`${error?.code}${error?.message}`).toMatch(/42501|permission denied/i);
  });

  it('service_role writes a session_revoked audit event for the target user', async () => {
    const { data: id, error } = await admin.rpc('record_session_revocation', {
      p_user_id: alice.id,
      p_reason: 'test_reason',
      p_scope: 'global',
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const { data: rows, error: selectError } = await admin
      .from('audit_events')
      .select('event_type, actor_user_id, actor_role, subject_type, subject_id, payload')
      .eq('id', id as string);
    expect(selectError).toBeNull();
    expect(rows).toHaveLength(1);
    const row = rows![0] as {
      event_type: string;
      actor_user_id: string | null;
      actor_role: string;
      subject_type: string;
      subject_id: string;
      payload: { reason?: string; scope?: string };
    };
    expect(row.event_type).toBe('session_revoked');
    expect(row.actor_user_id).toBeNull();
    expect(row.actor_role).toBe('system');
    expect(row.subject_type).toBe('user');
    expect(row.subject_id).toBe(alice.id);
    expect(row.payload.reason).toBe('test_reason');
    expect(row.payload.scope).toBe('global');
  });

  it('chain stays valid after the audited session revocation', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
});
