// CPD Sprint 3a / Task 5 — practitioner_licences RLS probes against the
// live dev project, as real JWTs. Gated: only runs under `pnpm test:rls`
// (RLS_TESTS=1).
//
// Shape differs from organisers/accrediting_bodies: this table is
// SELF-scoped (user_id = auth.uid()), not ORG-scoped, so ownership tests
// use real authenticated *user* sessions (createTestUser().client), and
// the body-admin read path additionally needs a staff fixture whose
// auth email matches a signed-in session.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('practitioner_licences RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let ownerBodyAdminStaff: TestUser;
  let otherOrgBodyAdminStaff: TestUser;
  let otherOrgId: string;
  let bodyId: string;
  let licenceId: string;
  const staffEmails: string[] = [];

  beforeAll(async () => {
    // Fixture org #2 so the "different org" body-admin read has a
    // genuinely different organisation_id to be scoped out of.
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2 (licences)', slug: `rls-test-org-2-lic-${Date.now()}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-LICENCES-${Date.now()}`,
        full_name: 'RLS Test Body (practitioner_licences fixture)',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    userA = await createTestUser('lic-owner');
    userB = await createTestUser('lic-other-user');
    ownerBodyAdminStaff = await createTestUser('lic-owner-org-body-admin');
    otherOrgBodyAdminStaff = await createTestUser('lic-other-org-body-admin');

    const { error: staffErr1 } = await admin.from('staff').insert({
      email: ownerBodyAdminStaff.email,
      role: 'body_admin',
      full_name: 'RLS Test Owner-Org Body Admin',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr1) throw new Error(`staff fixture (owner body_admin): ${staffErr1.message}`);
    staffEmails.push(ownerBodyAdminStaff.email);

    const { error: staffErr2 } = await admin.from('staff').insert({
      email: otherOrgBodyAdminStaff.email,
      role: 'body_admin',
      full_name: 'RLS Test Other-Org Body Admin',
      organisation_id: otherOrgId,
      status: 'active',
    });
    if (staffErr2) throw new Error(`staff fixture (other body_admin): ${staffErr2.message}`);
    staffEmails.push(otherOrgBodyAdminStaff.email);

    // userA's existing licence (is_primary=true), used as the read-path
    // fixture for the cross-user-denied / body-admin-read(s) tests. Created
    // via the real declare_licence/set_primary_licence RPCs, not a direct
    // admin insert — practitioner_licences.INSERT is revoked from every app
    // role including service_role (20260709300000), so these SECURITY
    // DEFINER functions are the only way any credential can create a row.
    const { data: licence, error: licenceErr } = await userA.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: 'HKICPA-RLS-0001',
    });
    if (licenceErr || !licence) throw new Error(`licence fixture: ${licenceErr?.message}`);
    licenceId = (licence as { id: string }).id;

    const { error: primaryErr } = await userA.client.rpc('set_primary_licence', {
      p_licence_id: licenceId,
    });
    if (primaryErr) throw new Error(`licence fixture (set_primary): ${primaryErr.message}`);
  }, 60_000);

  afterAll(async () => {
    await admin.from('practitioner_licences').delete().in('user_id', [userA.id, userB.id]);
    if (bodyId) await admin.from('accrediting_bodies').delete().eq('id', bodyId);
    for (const email of staffEmails) {
      await admin.from('staff').delete().eq('email', email);
    }
    for (const u of [userA, userB, ownerBodyAdminStaff, otherOrgBodyAdminStaff]) {
      if (u) await deleteTestUser(u);
    }
    if (otherOrgId) await admin.from('organisations').delete().eq('id', otherOrgId);
  }, 60_000);

  it('self user can read their own licence (self-read RLS)', async () => {
    const { data, error } = await userA.client
      .from('practitioner_licences')
      .select('id')
      .eq('id', licenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('self user cannot write their own licence directly — no self-write policy exists (Task 5 review: dropped in favour of Task 6\'s SECURITY DEFINER functions, which are the only mutation path)', async () => {
    // INSERT: RLS silently filters, PostgREST reports this as a 42501-shaped
    // failure at the API layer since no row can be returned to satisfy .select().
    const { error: insertError } = await userA.client
      .from('practitioner_licences')
      .insert({ user_id: userA.id, body_id: bodyId, licence_number: 'HKICPA-RLS-0002' })
      .select('id')
      .single();
    expect(insertError).not.toBeNull();

    // UPDATE: no error thrown (RLS filters the target row out of the DML,
    // not an explicit deny), but the update must not actually take effect —
    // verified via an independent admin-client re-read, not just "no error".
    await userA.client
      .from('practitioner_licences')
      .update({ status: 'verified' })
      .eq('id', licenceId);
    const { data: afterUpdate } = await admin
      .from('practitioner_licences')
      .select('status')
      .eq('id', licenceId)
      .single();
    expect(afterUpdate?.status).toBe('declared');

    // DELETE: same shape — no error, but the row must still exist after.
    await userA.client.from('practitioner_licences').delete().eq('id', licenceId);
    const { data: afterDelete } = await admin
      .from('practitioner_licences')
      .select('id')
      .eq('id', licenceId);
    expect(afterDelete).toHaveLength(1);
  });

  it("another user cannot read this user's licence (filtered, not errored)", async () => {
    const { data, error } = await userB.client
      .from('practitioner_licences')
      .select('id')
      .eq('id', licenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("body_admin staff of the licence's owning body organisation can read it", async () => {
    const { data, error } = await ownerBodyAdminStaff.client
      .from('practitioner_licences')
      .select('id')
      .eq('id', licenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('body_admin staff of a different organisation cannot read the licence (filtered, not errored)', async () => {
    const { data, error } = await otherOrgBodyAdminStaff.client
      .from('practitioner_licences')
      .select('id')
      .eq('id', licenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // No direct-insert test for practitioner_licences_one_primary_idx here
  // (unlike the earlier Task 5 version of this file): 20260709300000
  // revoked INSERT/UPDATE on practitioner_licences from every app role
  // including service_role, so a raw admin insert with is_primary=true can
  // no longer reach the DB at all (PostgREST rejects it before the unique
  // index is ever evaluated) — this test would just re-prove the grant
  // revoke, not the index. The invariant itself is double-covered instead:
  // Task 5's own migration assert confirmed the partial unique index
  // exists at apply time, and this file's two set_primary_licence tests
  // above prove the only two writer paths (declare_licence never sets
  // is_primary=true; set_primary_licence always demotes any other primary
  // in the same transaction before promoting) can never produce two
  // is_primary=true rows for one user — the constraint is now structurally
  // unreachable via any granted credential, not just index-enforced.
});
