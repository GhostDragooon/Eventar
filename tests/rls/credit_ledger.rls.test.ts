// credit_ledger had self-read + body-admin-read RLS policies since
// supabase/migrations/20260709250000_credit_ledger.sql, but no dedicated RLS
// test file — every comparable self/body-scoped table
// (practitioner_licences, accrediting_bodies, ...) has one. Shape mirrors
// tests/rls/practitioner_licences.rls.test.ts closely.
//
// Write-path coverage (the 42501 revoke on insert/update/delete from every
// role including service_role) already lives in
// tests/rls/audited_table_writes.rls.test.ts — this file is read-policy only.
//
// Fixture note: credit_ledger revokes insert/update/delete from anon,
// authenticated AND service_role (20260709260000_credit_ledger_hardening.sql:120),
// so `admin.from('credit_ledger').insert(...)` cannot work here — there is no
// simple single-row award RPC either (the real issuance path is the
// multi-body award engine, which needs a full event/check-in/accreditation-group
// setup unrelated to what this file is testing). Use sqlSuperuser() to bypass
// grants for the fixture row, same precedent as
// tests/rls/registrations_link_immutability.rls.test.ts's definer-bypass test.
// The hash-chain trigger still fires under a superuser insert (triggers are
// not grant-gated), so the row is a fully valid, chain-consistent entry.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  sqlSuperuser,
  type TestUser,
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ts = Date.now();
const REASON_MARKER = `RLS-TEST-credit-ledger-${ts}`;

describe.skipIf(!process.env.RLS_TESTS)('credit_ledger RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let ownerBodyAdminStaff: TestUser;
  let otherOrgBodyAdminStaff: TestUser;
  let otherOrgId: string;
  let bodyId: string;
  let licenceId: string;
  let ledgerEntryId: string;
  const staffEmails: string[] = [];

  beforeAll(async () => {
    // Fixture org #2 so the "different org" body-admin read has a genuinely
    // different organisation_id to be scoped out of.
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2 (credit_ledger)', slug: `rls-test-org-2-cl-${ts}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-LEDGER-${ts}`,
        full_name: 'RLS Test Body (credit_ledger fixture)',
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    userA = await createTestUser(`ledger-owner-${ts}`);
    userB = await createTestUser(`ledger-other-user-${ts}`);
    ownerBodyAdminStaff = await createTestUser(`ledger-owner-org-body-admin-${ts}`);
    otherOrgBodyAdminStaff = await createTestUser(`ledger-other-org-body-admin-${ts}`);

    const { error: staffErr1 } = await admin.from('staff').insert({
      email: ownerBodyAdminStaff.email,
      role: 'body_admin',
      full_name: 'RLS Test Owner-Org Body Admin (ledger)',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr1) throw new Error(`staff fixture (owner body_admin): ${staffErr1.message}`);
    staffEmails.push(ownerBodyAdminStaff.email);

    const { error: staffErr2 } = await admin.from('staff').insert({
      email: otherOrgBodyAdminStaff.email,
      role: 'body_admin',
      full_name: 'RLS Test Other-Org Body Admin (ledger)',
      organisation_id: otherOrgId,
      status: 'active',
    });
    if (staffErr2) throw new Error(`staff fixture (other body_admin): ${staffErr2.message}`);
    staffEmails.push(otherOrgBodyAdminStaff.email);

    // Real licence via the actual definer RPCs (practitioner_licences.INSERT
    // is revoked from every role too — this is the only legitimate write path,
    // same as practitioner_licences.rls.test.ts's own fixture).
    const { data: licence, error: licenceErr } = await userA.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: `LEDGER-RLS-${ts}`,
    });
    if (licenceErr || !licence) throw new Error(`licence fixture: ${licenceErr?.message}`);
    licenceId = (licence as { id: string }).id;

    await sqlSuperuser(`
      insert into public.credit_ledger
        (licence_id, user_id, body_id, entry_type, points, hours, effective_date, attestation_status, reason)
      values
        ('${licenceId}', '${userA.id}', '${bodyId}', 'credit_earned', 2, 1.5, current_date, 'organiser_attested', '${REASON_MARKER}');
    `);
    const { data: entry, error: entryErr } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('reason', REASON_MARKER)
      .single();
    if (entryErr || !entry) throw new Error(`ledger entry lookup: ${entryErr?.message}`);
    ledgerEntryId = entry.id as string;
  }, 60_000);

  afterAll(async () => {
    // credit_ledger has no DELETE grant for any role either (permanent
    // append-only, Hard Rule 11) — even sqlSuperuser via the admin client
    // can't remove it through PostgREST. Use the raw superuser connection,
    // same as the insert above, which bypasses grants entirely.
    await sqlSuperuser(`delete from public.credit_ledger where reason = '${REASON_MARKER}';`);
    await mustDelete(
      admin.from('practitioner_licences').delete().eq('id', licenceId),
      'practitioner_licences fixture',
    );
    if (bodyId) {
      await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId), 'accrediting_bodies fixture');
    }
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), `staff ${email}`);
    }
    for (const u of [userA, userB, ownerBodyAdminStaff, otherOrgBodyAdminStaff]) {
      if (u) await deleteTestUser(u);
    }
    if (otherOrgId) {
      await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'organisations fixture');
    }
  }, 60_000);

  it('self user can read their own credit_ledger entry (self-read RLS)', async () => {
    const { data, error } = await userA.client
      .from('credit_ledger')
      .select('id')
      .eq('id', ledgerEntryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("another user cannot read this user's credit_ledger entry (filtered, not errored)", async () => {
    const { data, error } = await userB.client
      .from('credit_ledger')
      .select('id')
      .eq('id', ledgerEntryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anon cannot read the credit_ledger entry (filtered, not errored)', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('credit_ledger')
      .select('id')
      .eq('id', ledgerEntryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("body_admin staff of the entry's owning body organisation can read it", async () => {
    const { data, error } = await ownerBodyAdminStaff.client
      .from('credit_ledger')
      .select('id')
      .eq('id', ledgerEntryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('body_admin staff of a different organisation cannot read the entry (filtered, not errored)', async () => {
    const { data, error } = await otherOrgBodyAdminStaff.client
      .from('credit_ledger')
      .select('id')
      .eq('id', ledgerEntryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
}, 90_000);
