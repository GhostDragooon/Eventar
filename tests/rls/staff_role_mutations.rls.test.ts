// CPD Milestone A / Task 9 — set_staff_role RLS + audit probes against the live
// dev project. Role *changes* become definer-only via a COLUMN-level revoke
// (`revoke update (role) on staff`), so a direct service-role UPDATE of the
// role column is refused (42501) while INSERTs — which set role at creation —
// keep working. The audited definer function set_staff_role() is the only
// change path; it gates on eventar_staff and emits a staff_role_changed audit
// event LAST.
//
// audit_events rows written by test 3 are append-only (Hard Rule 11 revokes
// service_role DELETE), so they are intentionally NOT cleaned up — same as
// every other RLS suite that exercises an audited mutation.
//
// Hard Rule 11 also wants a POSITIVE round-trip for every RETAINED grant, not
// just the negative on the locked column: staff_role_update_lock_fix revoked
// table UPDATE and granted back column UPDATE on every column EXCEPT role, so
// test 5 asserts a service-role UPDATE of a non-role column (full_name) still
// succeeds. Paired with test 1's 42501 on role, that pins the column boundary
// exactly where intended — a future migration that over-revokes staff UPDATE
// without the column re-grant fails test 5 (42501 on full_name), not silently.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type ChainRow = { link_valid: boolean; content_valid: boolean };

describe.skipIf(!process.env.RLS_TESTS)('set_staff_role — audited role mutation + column revoke', () => {
  let caller: TestUser; // eventar_staff — the only role allowed to call set_staff_role
  let plainUser: TestUser; // authenticated, non-staff — must be denied by the gate
  let targetStaffId: string; // the staff row whose role gets mutated
  const staffEmails: string[] = [];

  beforeAll(async () => {
    caller = await createTestUser('setstaffrole-caller');
    plainUser = await createTestUser('setstaffrole-plain');

    const targetEmail = `setstaffrole-target-${Date.now()}@rls-test.invalid`;
    const { error } = await admin.from('staff').insert([
      {
        email: caller.email,
        role: 'eventar_staff',
        full_name: 'RLS SSR Caller',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
      {
        email: targetEmail,
        role: 'organiser_member',
        full_name: 'RLS SSR Target',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
    ]);
    if (error) throw new Error(`staff fixture: ${error.message}`);
    staffEmails.push(caller.email, targetEmail);

    const { data: rows, error: lookErr } = await admin
      .from('staff')
      .select('id, email')
      .in('email', [targetEmail]);
    if (lookErr || !rows?.length) throw new Error(`target lookup: ${lookErr?.message}`);
    targetStaffId = rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    if (staffEmails.length > 0) {
      await mustDelete(admin.from('staff').delete().in('email', staffEmails), 'staff fixture');
    }
    for (const u of [caller, plainUser]) if (u) await deleteTestUser(u);
    // audit_events rows are append-only (Hard Rule 11) — intentionally left in place.
  }, 60_000);

  // ---- 1. direct service-role UPDATE of the role column is refused at the grant level ----
  it('service-role direct update of staff.role is denied (42501)', async () => {
    const { error } = await admin.from('staff').update({ role: 'body_admin' }).eq('id', targetStaffId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // ---- 2. a non-staff authenticated caller is denied by the in-function gate ----
  it('set_staff_role as a non-staff authenticated user is denied (42501)', async () => {
    const { error } = await plainUser.client.rpc('set_staff_role', {
      p_staff_id: targetStaffId,
      p_new_role: 'body_admin',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // ---- 3. an eventar_staff caller succeeds: role changed + audited + chain intact ----
  it('set_staff_role as eventar_staff changes the role, audits it, chain stays valid', async () => {
    const { error } = await caller.client.rpc('set_staff_role', {
      p_staff_id: targetStaffId,
      p_new_role: 'body_admin',
    });
    expect(error).toBeNull();

    const { data: staff } = await admin.from('staff').select('role').eq('id', targetStaffId).single();
    expect(staff?.role).toBe('body_admin');

    const { data: audit } = await admin
      .from('audit_events')
      .select('event_type, actor_role, payload')
      .eq('event_type', 'staff_role_changed')
      .eq('subject_id', targetStaffId)
      .order('chain_seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(audit).not.toBeNull();
    expect(audit?.actor_role).toBe('eventar_staff');
    const p = audit?.payload as {
      staff_id?: string;
      old_role?: string;
      new_role?: string;
      organisation_id?: string;
    };
    expect(p.staff_id).toBe(targetStaffId);
    expect(p.old_role).toBe('organiser_member');
    expect(p.new_role).toBe('body_admin');
    expect(p.organisation_id).toBe(DEFAULT_ORG);

    const { data: chain, error: chainErr } = await admin.rpc('verify_audit_chain');
    expect(chainErr).toBeNull();
    const broken = (chain as ChainRow[]).filter((r) => !r.link_valid || !r.content_valid);
    expect(broken).toHaveLength(0);
  }, 60_000);

  // ---- 4. regression: service-role INSERT of a staff row WITH a role still succeeds ----
  it('service-role INSERT of a staff row with a role still succeeds (revoke is UPDATE-only)', async () => {
    const email = `setstaffrole-insert-${Date.now()}@rls-test.invalid`;
    const { error } = await admin.from('staff').insert({
      email,
      role: 'auditor',
      full_name: 'RLS SSR Insert',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    expect(error).toBeNull();
    staffEmails.push(email);
  });

  // ---- 5. Hard Rule 11 positive round-trip: the RETAINED column grant works ----
  // Mirror image of test 1: role UPDATE is denied (42501), but a non-role column
  // UPDATE (full_name) must still succeed via the column grant re-issued by
  // staff_role_update_lock_fix. This is the positive round-trip Hard Rule 11
  // requires for retained grants — without it, a future over-revoke of staff
  // UPDATE would break the staff-profile write path with no test to catch it.
  it('service-role update of a non-role column (full_name) still succeeds', async () => {
    const newName = `RLS SSR Renamed ${Date.now()}`;
    const { error } = await admin.from('staff').update({ full_name: newName }).eq('id', targetStaffId);
    expect(error).toBeNull();

    const { data: staff } = await admin
      .from('staff')
      .select('full_name')
      .eq('id', targetStaffId)
      .single();
    expect(staff?.full_name).toBe(newName);
  });
});
