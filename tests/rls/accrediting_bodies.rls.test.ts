// CPD Sprint 3a / Task 3 — accrediting_bodies RLS probes against the live
// dev project, as real JWTs. Gated: only runs under `pnpm test:rls`
// (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('accrediting_bodies RLS', () => {
  let ownerOrgStaff: TestUser;
  let otherOrgStaff: TestUser;
  let plainUser: TestUser;
  let otherOrgId: string;
  let activeBodyId: string;
  let onboardingBodyId: string;
  const staffEmails: string[] = [];

  beforeAll(async () => {
    // Fixture org #2 so the wrong-org staff read has a genuinely different
    // organisation_id to be scoped out of (service_role bypasses RLS here).
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2', slug: `rls-test-org-2-${Date.now()}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    ownerOrgStaff = await createTestUser('ab-owner-staff');
    otherOrgStaff = await createTestUser('ab-other-staff');
    plainUser = await createTestUser('ab-plain');

    const { error: staffErr1 } = await admin.from('staff').insert({
      email: ownerOrgStaff.email,
      role: 'eventar_staff',
      full_name: 'RLS Test Owner-Org Staff',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr1) throw new Error(`staff fixture (owner): ${staffErr1.message}`);
    staffEmails.push(ownerOrgStaff.email);

    const { error: staffErr2 } = await admin.from('staff').insert({
      email: otherOrgStaff.email,
      role: 'organiser_admin',
      full_name: 'RLS Test Other-Org Staff',
      organisation_id: otherOrgId,
      status: 'active',
    });
    if (staffErr2) throw new Error(`staff fixture (other): ${staffErr2.message}`);
    staffEmails.push(otherOrgStaff.email);

    const { data: activeBody, error: activeErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: 'RLS-ACTIVE',
        full_name: 'RLS Test Active Body',
        cycle_config: { years: 3 },
        category_taxonomy: { categories: ['A'] },
        status: 'active',
      })
      .select('id')
      .single();
    if (activeErr || !activeBody) throw new Error(`active body fixture: ${activeErr?.message}`);
    activeBodyId = activeBody.id as string;

    const { data: onboardingBody, error: onboardingErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: 'RLS-ONBOARDING',
        full_name: 'RLS Test Onboarding Body',
        cycle_config: { years: 3 },
        category_taxonomy: { categories: ['A'] },
        status: 'onboarding',
      })
      .select('id')
      .single();
    if (onboardingErr || !onboardingBody) {
      throw new Error(`onboarding body fixture: ${onboardingErr?.message}`);
    }
    onboardingBodyId = onboardingBody.id as string;
  }, 60_000);

  afterAll(async () => {
    await admin
      .from('accrediting_bodies')
      .delete()
      .in('id', [activeBodyId, onboardingBodyId]);
    for (const email of staffEmails) {
      await admin.from('staff').delete().eq('email', email);
    }
    for (const u of [ownerOrgStaff, otherOrgStaff, plainUser]) {
      if (u) await deleteTestUser(u);
    }
    if (otherOrgId) await admin.from('organisations').delete().eq('id', otherOrgId);
  }, 60_000);

  it('owner-org active staff reads bodies in their org (both statuses)', async () => {
    const { data, error } = await ownerOrgStaff.client
      .from('accrediting_bodies')
      .select('id')
      .in('id', [activeBodyId, onboardingBodyId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('wrong-org staff cannot read the onboarding-status body (filtered, not errored)', async () => {
    // Deliberately checks only the onboarding-status body: the active-status
    // body is legitimately visible to ANY authenticated user via the
    // separate accrediting_bodies_public_read_active policy, so it isn't a
    // valid probe of org-scoping in isolation. Onboarding status has no
    // such public policy, so this isolates the org-staff-read policy.
    const { data, error } = await otherOrgStaff.client
      .from('accrediting_bodies')
      .select('id')
      .eq('id', onboardingBodyId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anon reads the active-status body', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('accrediting_bodies')
      .select('id, status')
      .eq('id', activeBodyId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(activeBodyId);
    expect(data?.status).toBe('active');
  });

  it('anon is denied the onboarding-status body (empty result, not an error)', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('accrediting_bodies')
      .select('id')
      .eq('id', onboardingBodyId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('authenticated non-staff cannot INSERT directly (42501)', async () => {
    const { error } = await plainUser.client.from('accrediting_bodies').insert({
      organisation_id: DEFAULT_ORG,
      short_name: 'FORGED',
      full_name: 'Forged Body',
      cycle_config: {},
      category_taxonomy: {},
    });
    expect(error?.code).toBe('42501');
  });
});
