// Sprint 2 / Task 6 — grant_consent / withdraw_consent RLS + audit probes
// against the live dev project, as real JWTs.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe.skipIf(!process.env.RLS_TESTS)('consent_audited RLS', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('consent-alice');
    bob = await createTestUser('consent-bob');
  }, 60_000);

  afterAll(async () => {
    for (const u of [alice, bob]) if (u) await deleteTestUser(u);
  }, 60_000);

  // ---- grant_consent: happy path ----
  it('grant_consent writes a consent row + audit event for the caller', async () => {
    const { data: id, error } = await alice.client.rpc('grant_consent', {
      p_consent_type: 'terms_of_service',
      p_version: 'tos-0.1-draft',
    });
    expect(error).toBeNull();
    const { data: rows } = await alice.client
      .from('consent_records')
      .select('id')
      .eq('id', id as string);
    expect(rows?.length).toBe(1);
    const { data: ev } = await admin
      .from('audit_events')
      .select('event_type, subject_id')
      .eq('subject_id', id as string)
      .eq('event_type', 'consent_granted');
    expect(ev?.length).toBe(1);
  });

  // ---- grant_consent: guard paths ----
  it('grant_consent rejects an unknown consent_type', async () => {
    const { data, error } = await alice.client.rpc('grant_consent', {
      p_consent_type: 'not_a_real_type',
      p_version: '1.0',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('grant_consent rejects an empty/whitespace version', async () => {
    const { data, error } = await alice.client.rpc('grant_consent', {
      p_consent_type: 'marketing',
      p_version: '   ',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  // ---- withdraw_consent: happy path ----
  it('withdraw_consent sets withdrawn_at + writes a consent_withdrawn audit event', async () => {
    const { data: id, error: grantError } = await alice.client.rpc(
      'grant_consent',
      { p_consent_type: 'privacy_policy', p_version: 'pp-1.0' },
    );
    expect(grantError).toBeNull();

    const { error: withdrawError } = await alice.client.rpc(
      'withdraw_consent',
      { p_consent_id: id as string },
    );
    expect(withdrawError).toBeNull();

    const { data: row } = await alice.client
      .from('consent_records')
      .select('withdrawn_at')
      .eq('id', id as string)
      .single();
    expect(row?.withdrawn_at).not.toBeNull();

    const { data: ev } = await admin
      .from('audit_events')
      .select('event_type, subject_id')
      .eq('subject_id', id as string)
      .eq('event_type', 'consent_withdrawn');
    expect(ev?.length).toBe(1);
  });

  // ---- withdraw_consent: guard paths ----
  it('withdraw_consent rejects withdrawing a different user’s consent record', async () => {
    const { data: aliceConsentId, error: grantError } = await alice.client.rpc(
      'grant_consent',
      { p_consent_type: 'ai_processing_notice', p_version: 'ai-1.0' },
    );
    expect(grantError).toBeNull();

    const { data, error } = await bob.client.rpc('withdraw_consent', {
      p_consent_id: aliceConsentId as string,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();

    // Confirm alice's record was NOT withdrawn by bob's attempt.
    const { data: row } = await alice.client
      .from('consent_records')
      .select('withdrawn_at')
      .eq('id', aliceConsentId as string)
      .single();
    expect(row?.withdrawn_at).toBeNull();
  });

  it('withdraw_consent rejects double-withdrawal', async () => {
    const { data: id, error: grantError } = await alice.client.rpc(
      'grant_consent',
      { p_consent_type: 'marketing', p_version: 'mk-1.0' },
    );
    expect(grantError).toBeNull();

    const { error: firstError } = await alice.client.rpc('withdraw_consent', {
      p_consent_id: id as string,
    });
    expect(firstError).toBeNull();

    const { data, error: secondError } = await alice.client.rpc(
      'withdraw_consent',
      { p_consent_id: id as string },
    );
    expect(data).toBeNull();
    expect(secondError).not.toBeNull();
  });

  // ---- unauthenticated guard ----
  it('grant_consent rejects an unauthenticated caller (42501)', async () => {
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.rpc('grant_consent', {
      p_consent_type: 'terms_of_service',
      p_version: '1.0',
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});
