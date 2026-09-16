// WP-C — controlled lists (professions/positions/degrees/specialties/
// societies) RLS + grant regression suite.
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 1.
// Guarantees the public-read-only shape shipped in 20260916000000 (anon +
// authenticated SELECT active rows; no client write; service_role full
// access for a future admin UI) can't drift without this test going red.

import { describe, it, expect } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

describe.skipIf(!process.env.RLS_TESTS)('controlled lists RLS + grants', () => {
  it('anon can SELECT active professions', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from('professions').select('code').eq('code', 'medicine');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('anon cannot INSERT into professions (RLS blocks despite table grant)', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('professions')
      .insert({ code: 'rls-probe-anon', label_en: 'probe' })
      .select('code');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
    // Table-level grant exists (seed.sql blanket) but no RLS policy permits
    // this — confirm the row was never written, not just that an error came back.
    const { data: check } = await admin.from('professions').select('code').eq('code', 'rls-probe-anon');
    expect(check ?? []).toHaveLength(0);
  });

  it('authenticated cannot INSERT into specialties (RLS blocks; no self-write policy exists)', async () => {
    const user: TestUser = await createTestUser(`cl-probe-${Date.now()}`);
    try {
      const { data, error } = await user.client
        .from('specialties')
        .insert({ code: 'rls-probe-auth', label_en: 'probe' })
        .select('code');
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    } finally {
      await deleteTestUser(user);
    }
  });

  it('specialties.profession_code FK resolves against professions', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('specialties')
      .select('code, profession_code')
      .eq('code', 'cardiac_cardiovascular')
      .single();
    expect(error).toBeNull();
    expect(data?.profession_code).toBe('medicine');
  });

  // dev-review finding: only INSERT was covered. UPDATE denial is silent
  // (RLS filters the USING set to empty, not a 42501) rather than erroring,
  // which is the more dangerous shape to leave untested — a future
  // accidental `for update to authenticated using (true)` would pass every
  // prior test in this file without a single red assertion. Assert on the
  // actual row's data, not just on error presence, matching
  // additional_appointments.rls.test.ts's own convention.
  it('authenticated cannot UPDATE a professions row (RLS silently affects zero rows)', async () => {
    const user: TestUser = await createTestUser(`cl-upd-${Date.now()}`);
    try {
      const { error } = await user.client
        .from('professions')
        .update({ label_en: 'Tampered' })
        .eq('code', 'medicine');
      void error; // a 0-row UPDATE is not guaranteed to surface as an error
      const { data } = await admin.from('professions').select('label_en').eq('code', 'medicine').single();
      expect(data?.label_en).toBe('Medicine');
    } finally {
      await deleteTestUser(user);
    }
  });

  it('authenticated cannot DELETE a professions row (RLS silently affects zero rows)', async () => {
    const user: TestUser = await createTestUser(`cl-del-${Date.now()}`);
    try {
      const { error } = await user.client.from('professions').delete().eq('code', 'medicine');
      void error;
      const { data } = await admin.from('professions').select('code').eq('code', 'medicine');
      expect(data ?? []).toHaveLength(1);
    } finally {
      await deleteTestUser(user);
    }
  });

  // dev-review finding: is_active is the policy's only discriminating
  // condition and had zero coverage (no inactive row existed in the seed).
  it('an inactive profession is invisible to anon SELECT', async () => {
    const code = `rls-inactive-${Date.now()}`;
    await admin.from('professions').insert({ code, label_en: 'Inactive probe', is_active: false });
    try {
      const anon = createAnonClient();
      const { data, error } = await anon.from('professions').select('code').eq('code', code);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    } finally {
      await admin.from('professions').delete().eq('code', code);
    }
  });
}, 60_000);
