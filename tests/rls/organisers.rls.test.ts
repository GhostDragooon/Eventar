// CPD Sprint 3a / Task 4 — organisers RLS probes against the live
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

describe.skipIf(!process.env.RLS_TESTS)('organisers RLS', () => {
  let ownerOrgStaff: TestUser;
  let otherOrgStaff: TestUser;
  let otherOrgId: string;
  let organiserId: string;
  let bodyId: string;
  const staffEmails: string[] = [];

  beforeAll(async () => {
    // Fixture org #2 so the wrong-org staff read has a genuinely different
    // organisation_id to be scoped out of (service_role bypasses RLS here).
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2 (organisers)', slug: `rls-test-org-2-org-${Date.now()}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    ownerOrgStaff = await createTestUser('org-owner-staff');
    otherOrgStaff = await createTestUser('org-other-staff');

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

    // Fixture accrediting_bodies row so primary_body_id has a real FK
    // target to round-trip against (Task 4 review: this relationship was
    // untested — the one thing that makes organisers more than a
    // structural twin of accrediting_bodies).
    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-ORGANISERS-${Date.now()}`,
        full_name: 'RLS Test Body (organisers fixture)',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    const { data: organiser, error: organiserErr } = await admin
      .from('organisers')
      .insert({
        organisation_id: DEFAULT_ORG,
        legal_name: 'RLS Test Organiser Ltd',
        display_name: 'RLS Test Organiser',
        organisation_type: 'training_provider',
        contact_email: 'organiser@rls-test.invalid',
        primary_body_id: bodyId,
      })
      .select('id')
      .single();
    if (organiserErr || !organiser) {
      throw new Error(`organiser fixture: ${organiserErr?.message}`);
    }
    organiserId = organiser.id as string;
  }, 60_000);

  afterAll(async () => {
    await admin.from('organisers').delete().eq('id', organiserId);
    if (bodyId) await admin.from('accrediting_bodies').delete().eq('id', bodyId);
    for (const email of staffEmails) {
      await admin.from('staff').delete().eq('email', email);
    }
    for (const u of [ownerOrgStaff, otherOrgStaff]) {
      if (u) await deleteTestUser(u);
    }
    if (otherOrgId) await admin.from('organisations').delete().eq('id', otherOrgId);
  }, 60_000);

  it('owner-org active staff reads organisers in their org', async () => {
    const { data, error } = await ownerOrgStaff.client
      .from('organisers')
      .select('id')
      .eq('id', organiserId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('wrong-org staff cannot read the organiser (filtered, not errored)', async () => {
    const { data, error } = await otherOrgStaff.client
      .from('organisers')
      .select('id')
      .eq('id', organiserId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anon is denied entirely — no policy exists for anon (empty result, not an error)', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('organisers')
      .select('id')
      .eq('id', organiserId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('primary_body_id round-trips to a real accrediting_bodies row', async () => {
    const { data, error } = await admin
      .from('organisers')
      .select('primary_body_id')
      .eq('id', organiserId)
      .single();
    expect(error).toBeNull();
    expect(data?.primary_body_id).toBe(bodyId);
  });

  it('primary_body_id rejects a non-existent accrediting_bodies id (FK violation, 23503)', async () => {
    const { error } = await admin
      .from('organisers')
      .insert({
        organisation_id: DEFAULT_ORG,
        legal_name: 'RLS Test Organiser Ltd 2',
        display_name: 'RLS Test Organiser 2',
        organisation_type: 'training_provider',
        contact_email: 'organiser2@rls-test.invalid',
        primary_body_id: '00000000-0000-0000-0000-000000009999',
      })
      .select('id')
      .single();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23503');
  });
});
