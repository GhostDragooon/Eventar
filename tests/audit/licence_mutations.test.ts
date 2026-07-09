// CPD Sprint 3a / Task 6 — licence mutation functions (declare/set_primary/
// verify/lapse/revoke/supersede) against the live dev project, as real
// JWTs. These SECURITY DEFINER functions are the SOLE mutation path for
// practitioner_licences (practitioner_licences_self_write was dropped —
// see 20260709210000 — after a review found it let a practitioner forge
// their own status='verified' directly).
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type LicenceRow = {
  id: string;
  user_id: string;
  body_id: string;
  licence_number: string;
  licence_type: string | null;
  is_primary: boolean;
  status: string;
  verified_at: string | null;
  lapsed_at: string | null;
  revoked_at: string | null;
  superseded_by: string | null;
};

describe.skipIf(!process.env.RLS_TESTS)('licence mutation functions', () => {
  let userA: TestUser;
  let userB: TestUser;
  let ownerOrgBodyAdmin: TestUser;
  let otherOrgBodyAdmin: TestUser;
  let otherOrgId: string;
  let bodyId: string;
  const staffEmails: string[] = [];
  const ts = Date.now();

  async function makeStaffFixture(
    localPart: string,
    role: 'body_admin' | 'eventar_staff',
    organisationId: string,
  ): Promise<TestUser> {
    const user = await createTestUser(localPart);
    const { error } = await admin.from('staff').insert({
      email: user.email,
      role,
      full_name: 'RLS Test Body Admin',
      organisation_id: organisationId,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture (${role}): ${error.message}`);
    staffEmails.push(user.email);
    return user;
  }

  async function makeLicence(
    userId: string,
    licenceNumber: string,
    opts: { isPrimary?: boolean; licenceType?: string; status?: string } = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from('practitioner_licences')
      .insert({
        user_id: userId,
        body_id: bodyId,
        licence_number: licenceNumber,
        is_primary: opts.isPrimary ?? false,
        licence_type: opts.licenceType ?? null,
        status: opts.status ?? 'declared',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`licence fixture: ${error?.message}`);
    return data.id as string;
  }

  async function auditEventFor(eventType: string, subjectId: string) {
    const { data } = await admin
      .from('audit_events')
      .select('event_type, actor_role, subject_type, subject_id, payload')
      .eq('event_type', eventType)
      .eq('subject_id', subjectId)
      .maybeSingle();
    return data as {
      event_type: string;
      actor_role: string | null;
      subject_type: string | null;
      subject_id: string;
      payload: Record<string, unknown>;
    } | null;
  }

  beforeAll(async () => {
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2 (licence mutations)', slug: `rls-test-org-2-lm-${ts}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-LM-${ts}`,
        full_name: 'RLS Test Body (licence_mutations fixture)',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    userA = await createTestUser('lm-user-a');
    userB = await createTestUser('lm-user-b');
    ownerOrgBodyAdmin = await makeStaffFixture('lm-owner-org-body-admin', 'body_admin', DEFAULT_ORG);
    otherOrgBodyAdmin = await makeStaffFixture('lm-other-org-body-admin', 'body_admin', otherOrgId);
  }, 60_000);

  afterAll(async () => {
    await admin.from('practitioner_licences').delete().in('user_id', [userA.id, userB.id]);
    if (bodyId) await admin.from('accrediting_bodies').delete().eq('id', bodyId);
    for (const email of staffEmails) {
      await admin.from('staff').delete().eq('email', email);
    }
    for (const u of [userA, userB, ownerOrgBodyAdmin, otherOrgBodyAdmin]) {
      if (u) await deleteTestUser(u);
    }
    if (otherOrgId) await admin.from('organisations').delete().eq('id', otherOrgId);
  }, 60_000);

  describe('declare_licence', () => {
    it('self user declares a licence: row created + audit event recorded', async () => {
      const { data, error } = await userA.client.rpc('declare_licence', {
        p_body_id: bodyId,
        p_licence_number: `LM-DECLARE-${ts}`,
        p_licence_type: 'full-registration',
      });
      expect(error).toBeNull();
      const row = data as LicenceRow;
      expect(row.user_id).toBe(userA.id);
      expect(row.body_id).toBe(bodyId);
      expect(row.licence_number).toBe(`LM-DECLARE-${ts}`);
      expect(row.status).toBe('declared');

      const ev = await auditEventFor('licence_declared', row.id);
      expect(ev).not.toBeNull();
      expect(ev?.subject_type).toBe('practitioner_licence');
      expect(ev?.payload.body_id).toBe(bodyId);
      expect(ev?.payload.licence_id).toBe(row.id);
    });

    // declare_licence has no target-user parameter — it always inserts under
    // auth.uid(), so there is no "act on someone else's licence" scenario to
    // probe here. Its actual gate is the auth.uid() IS NULL check, so the
    // wrong-actor analog for this function is an unauthenticated (anon) call.
    it('anon (unauthenticated) caller is rejected with 42501', async () => {
      const anon = createAnonClient();
      const { data, error } = await anon.rpc('declare_licence', {
        p_body_id: bodyId,
        p_licence_number: `LM-DECLARE-ANON-${ts}`,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    });
  });

  describe('set_primary_licence', () => {
    it("self user promotes a licence to primary; the previous primary is demoted, and an audit event is recorded", async () => {
      const existingPrimary = await makeLicence(userA.id, `LM-SETPRIMARY-OLD-${ts}`, {
        isPrimary: true,
      });
      const toPromote = await makeLicence(userA.id, `LM-SETPRIMARY-NEW-${ts}`);

      const { data, error } = await userA.client.rpc('set_primary_licence', {
        p_licence_id: toPromote,
      });
      expect(error).toBeNull();
      const row = data as LicenceRow;
      expect(row.id).toBe(toPromote);
      expect(row.is_primary).toBe(true);

      const { data: oldRow } = await admin
        .from('practitioner_licences')
        .select('is_primary')
        .eq('id', existingPrimary)
        .single();
      expect(oldRow?.is_primary).toBe(false);

      const ev = await auditEventFor('licence_marked_primary', toPromote);
      expect(ev).not.toBeNull();
      expect(ev?.payload.licence_id).toBe(toPromote);
    });

    it("a different authenticated user cannot set another user's licence as primary (42501)", async () => {
      const target = await makeLicence(userA.id, `LM-SETPRIMARY-DENIAL-${ts}`);
      const { data, error } = await userB.client.rpc('set_primary_licence', {
        p_licence_id: target,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('is_primary')
        .eq('id', target)
        .single();
      expect(row?.is_primary).toBe(false);
    });
  });

  describe('verify_licence', () => {
    it('body_admin of the owning organisation verifies a licence; audit event recorded', async () => {
      const licenceId = await makeLicence(userA.id, `LM-VERIFY-OK-${ts}`);
      const { data, error } = await ownerOrgBodyAdmin.client.rpc('verify_licence', {
        p_licence_id: licenceId,
      });
      expect(error).toBeNull();
      const row = data as LicenceRow;
      expect(row.status).toBe('verified');
      expect(row.verified_at).not.toBeNull();

      const ev = await auditEventFor('licence_verified', licenceId);
      expect(ev).not.toBeNull();
      expect(ev?.actor_role).toBe('body_admin');
      expect(ev?.payload.licence_id).toBe(licenceId);
      expect(ev?.payload.body_id).toBe(bodyId);
    });

    it('non-staff caller gets 42501, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-VERIFY-NONSTAFF-${ts}`);
      const { data, error } = await userB.client.rpc('verify_licence', {
        p_licence_id: licenceId,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });

    it("body_admin of a DIFFERENT organisation gets 42501 (org-match gate), licence unaffected", async () => {
      const licenceId = await makeLicence(userA.id, `LM-VERIFY-WRONGORG-${ts}`);
      const { data, error } = await otherOrgBodyAdmin.client.rpc('verify_licence', {
        p_licence_id: licenceId,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });
  });

  describe('lapse_licence', () => {
    it('body_admin of the owning organisation lapses a licence; audit event recorded with reason', async () => {
      const licenceId = await makeLicence(userA.id, `LM-LAPSE-OK-${ts}`);
      const { data, error } = await ownerOrgBodyAdmin.client.rpc('lapse_licence', {
        p_licence_id: licenceId,
        p_reason: 'CPD cycle expired without renewal',
      });
      expect(error).toBeNull();
      const row = data as LicenceRow;
      expect(row.status).toBe('lapsed');
      expect(row.lapsed_at).not.toBeNull();

      const ev = await auditEventFor('licence_lapsed', licenceId);
      expect(ev).not.toBeNull();
      expect(ev?.payload.reason).toBe('CPD cycle expired without renewal');
    });

    it('non-staff caller gets 42501, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-LAPSE-NONSTAFF-${ts}`);
      const { data, error } = await userB.client.rpc('lapse_licence', {
        p_licence_id: licenceId,
        p_reason: 'attempted forgery',
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });

    it('body_admin of a DIFFERENT organisation gets 42501, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-LAPSE-WRONGORG-${ts}`);
      const { data, error } = await otherOrgBodyAdmin.client.rpc('lapse_licence', {
        p_licence_id: licenceId,
        p_reason: 'attempted cross-org lapse',
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });
  });

  describe('revoke_licence', () => {
    it('body_admin of the owning organisation revokes a licence; audit event recorded with reason', async () => {
      const licenceId = await makeLicence(userA.id, `LM-REVOKE-OK-${ts}`);
      const { data, error } = await ownerOrgBodyAdmin.client.rpc('revoke_licence', {
        p_licence_id: licenceId,
        p_reason: 'licence number found to be fraudulent',
      });
      expect(error).toBeNull();
      const row = data as LicenceRow;
      expect(row.status).toBe('revoked');
      expect(row.revoked_at).not.toBeNull();

      const ev = await auditEventFor('licence_revoked', licenceId);
      expect(ev).not.toBeNull();
      expect(ev?.payload.reason).toBe('licence number found to be fraudulent');
    });

    it('non-staff caller gets 42501, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-REVOKE-NONSTAFF-${ts}`);
      const { data, error } = await userB.client.rpc('revoke_licence', {
        p_licence_id: licenceId,
        p_reason: 'attempted forgery',
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });

    it('body_admin of a DIFFERENT organisation gets 42501, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-REVOKE-WRONGORG-${ts}`);
      const { data, error } = await otherOrgBodyAdmin.client.rpc('revoke_licence', {
        p_licence_id: licenceId,
        p_reason: 'attempted cross-org revocation',
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });

    it('whitespace-only reason is rejected with a non-42501 error, licence unaffected', async () => {
      const licenceId = await makeLicence(userA.id, `LM-REVOKE-NOREASON-${ts}`);
      const { data, error } = await ownerOrgBodyAdmin.client.rpc('revoke_licence', {
        p_licence_id: licenceId,
        p_reason: '   ',
      });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).not.toBe('42501');
      expect(error?.message).toMatch(/reason is required/);

      const { data: row } = await admin
        .from('practitioner_licences')
        .select('status')
        .eq('id', licenceId)
        .single();
      expect(row?.status).toBe('declared');
    });
  });

  describe('supersede_licence', () => {
    it('self user supersedes their own licence: old row marked superseded, new row returned with inherited fields, audit event recorded', async () => {
      const oldId = await makeLicence(userA.id, `LM-SUPERSEDE-OLD-${ts}`, {
        licenceType: 'full-registration',
      });

      const { data, error } = await userA.client.rpc('supersede_licence', {
        p_old_licence_id: oldId,
        p_new_licence_number: `LM-SUPERSEDE-NEW-${ts}`,
      });
      expect(error).toBeNull();
      const newRow = data as LicenceRow;
      expect(newRow.id).not.toBe(oldId);
      expect(newRow.user_id).toBe(userA.id);
      expect(newRow.body_id).toBe(bodyId);
      expect(newRow.licence_type).toBe('full-registration');
      expect(newRow.licence_number).toBe(`LM-SUPERSEDE-NEW-${ts}`);
      expect(newRow.status).toBe('declared');

      const { data: oldRow } = await admin
        .from('practitioner_licences')
        .select('status, superseded_by')
        .eq('id', oldId)
        .single();
      expect(oldRow?.status).toBe('superseded');
      expect(oldRow?.superseded_by).toBe(newRow.id);

      const ev = await auditEventFor('licence_superseded', newRow.id);
      expect(ev).not.toBeNull();
      expect(ev?.payload.old_licence_id).toBe(oldId);
      expect(ev?.payload.new_licence_id).toBe(newRow.id);
    });

    it("a different authenticated user cannot supersede someone else's licence (42501)", async () => {
      const oldId = await makeLicence(userA.id, `LM-SUPERSEDE-DENIAL-${ts}`);
      const { data, error } = await userB.client.rpc('supersede_licence', {
        p_old_licence_id: oldId,
        p_new_licence_number: `LM-SUPERSEDE-DENIAL-NEW-${ts}`,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const { data: oldRow } = await admin
        .from('practitioner_licences')
        .select('status, superseded_by')
        .eq('id', oldId)
        .single();
      expect(oldRow?.status).toBe('declared');
      expect(oldRow?.superseded_by).toBeNull();
    });

    it('cannot supersede a revoked licence — from-state guard blocks routing around a staff revocation (22023)', async () => {
      const oldId = await makeLicence(userA.id, `LM-SUPERSEDE-REVOKED-${ts}`, {
        status: 'revoked',
      });
      const { data, error } = await userA.client.rpc('supersede_licence', {
        p_old_licence_id: oldId,
        p_new_licence_number: `LM-SUPERSEDE-REVOKED-NEW-${ts}`,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('22023');

      // The revoked row must be untouched — no superseded_by, still revoked.
      const { data: oldRow } = await admin
        .from('practitioner_licences')
        .select('status, superseded_by')
        .eq('id', oldId)
        .single();
      expect(oldRow?.status).toBe('revoked');
      expect(oldRow?.superseded_by).toBeNull();
    });

    it('superseding a primary licence carries is_primary forward to the new row and demotes the old', async () => {
      // userB (not userA, who already holds a primary from the set_primary
      // tests) — the partial unique index allows one is_primary=true per user.
      const oldId = await makeLicence(userB.id, `LM-SUPERSEDE-PRIMARY-${ts}`, {
        isPrimary: true,
      });
      const { data, error } = await userB.client.rpc('supersede_licence', {
        p_old_licence_id: oldId,
        p_new_licence_number: `LM-SUPERSEDE-PRIMARY-NEW-${ts}`,
      });
      expect(error).toBeNull();
      const newRow = data as LicenceRow;
      expect(newRow.is_primary).toBe(true);

      const { data: oldRow } = await admin
        .from('practitioner_licences')
        .select('is_primary, status')
        .eq('id', oldId)
        .single();
      expect(oldRow?.is_primary).toBe(false);
      expect(oldRow?.status).toBe('superseded');
    });
  });
});
