// Cross-tenant READ scope of people's data, the audit log and the staff directory (found 2026-10-10
// while closing the DSR hole; decided by Ivan 2026-10-10, Decisions Log Q43; the reasoning is in
// migration 20261010083221).
//
// app_private.is_manager() had no organisation test, so any organisation's admin read every row of
// users, audit_events, staff, consent_records, professional_profiles, society_memberships and
// additional_appointments. Now: those tables except staff are readable by the person (where a self
// policy exists) and the platform operator only; staff by its owner, the operator and an active
// organiser_admin of the ROW'S organisation (one person can be admin of A and only a member of B),
// never an operator row.
//
// Every read asserts the EXACT visible set, not "the forbidden row is absent". The suite writes one
// org-tagged audit row per run (audit_events is append-only, and the assertion needs a row that an
// org-scoped policy WOULD have shown). Gated on RLS_TESTS; local stack only (tests/helpers/clients.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, createAnonClient, createTestUser, deleteTestUser, sqlSuperuserQuery, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const ts = Date.now();
const PROBE_EVENT = `rls_scope_probe_${ts}`;

// The shared-identity tables whose only legitimate readers are the person and the operator.
const PERSON_TABLES = ['consent_records', 'professional_profiles', 'society_memberships', 'additional_appointments'] as const;

async function visible(client: SupabaseClient, table: string, column = 'id'): Promise<string[]> {
  const { data, error } = await client.from(table).select(column);
  if (error) throw new Error(`${table}: ${error.message} [${error.code}]`);
  return (data as unknown as Record<string, string>[]).map((r) => r[column]);
}

const sorted = (xs: string[]) => [...xs].sort();

describe.skipIf(!process.env.RLS_TESTS)('cross-organisation read scope: people, audit log and staff directory', () => {
  let orgA: string;
  let orgB: string;
  let orgOp: string; // the operator's own organisation: no tenant admin lives here
  const staffRow: Record<string, string> = {}; // fixture key -> staff.id
  const staffEmails: string[] = [];
  const eventIds: string[] = [];
  const users: TestUser[] = [];

  let adminA: TestUser; // organiser_admin, org A
  let memberA: TestUser; // organiser_member, org A
  let bodyA: TestUser; // body_admin, org A
  let auditorA: TestUser; // auditor, org A
  let suspendedA: TestUser; // organiser_admin, org A, status suspended
  let adminB: TestUser; // organiser_admin, org B
  let multi: TestUser; // organiser_admin of org A AND organiser_member of org B
  let operator: TestUser; // eventar_staff, in its own organisation
  let person1: TestUser; // registrant at an org A event, with a row in every person table
  let person2: TestUser; // registrant at an org B event, with a row in every person table

  async function mkUser(localPart: string): Promise<TestUser> {
    const u = await createTestUser(`${localPart}-${ts}`);
    users.push(u);
    return u;
  }

  async function mkOrg(label: string): Promise<string> {
    const { data, error } = await admin
      .from('organisations')
      .insert({ name: `Read scope ${label} ${ts}`, slug: `read-scope-${label}-${ts}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`organisation ${label}: ${error?.message}`);
    return data.id as string;
  }

  async function mkStaff(
    key: string,
    user: Pick<TestUser, 'email'>,
    role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff',
    organisationId: string,
    status: 'active' | 'suspended' = 'active',
  ): Promise<void> {
    const { data, error } = await admin
      .from('staff')
      .insert({ email: user.email, role, full_name: 'Read scope fixture', organisation_id: organisationId, status })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture (${key}): ${error?.message}`);
    staffRow[key] = data.id as string;
    if (!staffEmails.includes(user.email)) staffEmails.push(user.email);
  }

  async function mkEventWithRegistration(createdBy: string, expectedOrg: string, subject: TestUser, n: number): Promise<void> {
    const { data: ev, error } = await admin
      .from('events')
      .insert({
        title: 'Read scope fixture — DELETE ME',
        start_time: new Date(Date.now() + 3_600_000).toISOString(),
        end_time: new Date(Date.now() + 7_200_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: createdBy,
        venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status: 'published',
      })
      .select('id, organisation_id')
      .single();
    if (error || !ev) throw new Error(`event fixture: ${error?.message}`);
    eventIds.push(ev.id as string);
    // Guard against a vacuous fixture: "person1 is a registrant of org A" is the whole point.
    if (ev.organisation_id !== expectedOrg) {
      throw new Error(`event fixture landed in ${ev.organisation_id}, expected ${expectedOrg}`);
    }
    const reg = await admin.from('registrations').insert({
      event_id: ev.id,
      user_id: subject.id,
      email: subject.email,
      full_name: 'Read scope subject',
      registration_code: `WK-XO${n}${String(ts).slice(-5)}`,
    });
    if (reg.error) throw new Error(`registration fixture: ${reg.error.message}`);
  }

  async function mkPersonData(person: TestUser): Promise<void> {
    const results = await Promise.all([
      admin.from('consent_records').insert({ user_id: person.id, consent_type: 'privacy_policy', version: `xo-${ts}` }),
      admin.from('professional_profiles').upsert({ user_id: person.id }, { onConflict: 'user_id' }),
      admin.from('society_memberships').insert({ user_id: person.id, society_code: 'HKCS' }),
      admin.from('additional_appointments').insert({ user_id: person.id, institution_name: 'Read scope fixture', title: 'Fixture' }),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`person data fixture: ${failed.error.message}`);
  }

  beforeAll(async () => {
    orgA = await mkOrg('a');
    orgB = await mkOrg('b');
    orgOp = await mkOrg('op');

    adminA = await mkUser('xo-admin-a');
    memberA = await mkUser('xo-member-a');
    bodyA = await mkUser('xo-body-a');
    auditorA = await mkUser('xo-auditor-a');
    suspendedA = await mkUser('xo-suspended-a');
    adminB = await mkUser('xo-admin-b');
    multi = await mkUser('xo-multi');
    operator = await mkUser('xo-operator');
    person1 = await mkUser('xo-person-1');
    person2 = await mkUser('xo-person-2');

    await mkStaff('adminA', adminA, 'organiser_admin', orgA);
    await mkStaff('memberA', memberA, 'organiser_member', orgA);
    await mkStaff('bodyA', bodyA, 'body_admin', orgA);
    await mkStaff('auditorA', auditorA, 'auditor', orgA);
    await mkStaff('suspendedA', suspendedA, 'organiser_admin', orgA, 'suspended');
    await mkStaff('adminB', adminB, 'organiser_admin', orgB);
    // multi: admin of A, but only a MEMBER of B. A role-only check would show it all of B's team.
    // The MEMBER row (B) is created FIRST, so it is the older one: a helper that looks at the
    // caller's first organisation (current_staff_org_id) would resolve to B and get both halves wrong.
    await mkStaff('multiB', multi, 'organiser_member', orgB);
    await mkStaff('multiA', multi, 'organiser_admin', orgA);
    await mkStaff('operator', operator, 'eventar_staff', orgOp);
    // An operator row placed INSIDE a tenant's organisation (the seed's first-operator bootstrap puts it
    // in `default`, next to tenant admins): platform staff are not tenant staff.
    await mkStaff('operatorInA', { email: `xo-operator-in-a-${ts}@rls-test.invalid` }, 'eventar_staff', orgA);

    // person1 is a registrant of org A's event, person2 of org B's.
    await mkEventWithRegistration(staffRow.adminA, orgA, person1, 1);
    await mkEventWithRegistration(staffRow.adminB, orgB, person2, 2);
    await mkPersonData(person1);
    await mkPersonData(person2);

    // One audit row tagged with org A: if the audit log were org-scoped, org A's admin would see it.
    const { error } = await admin.rpc('write_audit_event', {
      p_event_type: PROBE_EVENT,
      p_actor_user_id: null,
      p_actor_role: 'eventar_staff',
      p_organisation_id: orgA,
      p_subject_type: 'organisation',
      p_subject_id: orgA,
      p_payload: { fixture: 'cross_org_read_scope' },
    });
    if (error) throw new Error(`audit probe: ${error.message}`);
  }, 180_000);

  afterAll(async () => {
    if (eventIds.length) {
      await mustDelete(admin.from('registrations').delete().in('event_id', eventIds), 'registrations');
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events');
    }
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), `staff ${email}`);
    }
    for (const org of [orgA, orgB, orgOp]) {
      if (org) await mustDelete(admin.from('organisations').delete().eq('id', org), 'organisations');
    }
    // The person-table rows cascade with public.users; the audit probe row is append-only by design.
    for (const u of users) await deleteTestUser(u);
  }, 180_000);

  // The fixture is only meaningful if the rows the assertions below must NOT see really exist.
  describe('fixture sanity (service role)', () => {
    it('the rows the tenant admins must not see exist', async () => {
      const ids = [person1.id, person2.id];
      expect((await admin.from('users').select('id').in('id', ids)).data).toHaveLength(2);
      for (const t of PERSON_TABLES) {
        expect((await admin.from(t).select('user_id').in('user_id', ids)).data, t).toHaveLength(2);
      }
      const probe = await admin.from('audit_events').select('organisation_id').eq('event_type', PROBE_EVENT);
      expect(probe.data).toEqual([{ organisation_id: orgA }]);
      const team = await admin.from('staff').select('id').in('organisation_id', [orgA, orgB, orgOp]);
      expect(team.data).toHaveLength(10);
    });
  });

  describe('a tenant admin (org A organiser_admin)', () => {
    it('reads exactly its own users row: not a registrant of its own event, not anyone else', async () => {
      expect(await visible(adminA.client, 'users')).toEqual([adminA.id]);
    });

    it.each(PERSON_TABLES)('reads no one else\'s %s row, not even a registrant of its own event', async (table) => {
      const rows = await visible(adminA.client, table, 'user_id');
      expect(rows.filter((id) => id !== adminA.id)).toEqual([]);
      const { data, error } = await adminA.client.from(table).select('user_id').eq('user_id', person1.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('reads no audit_events row: not other organisations\', not people-level events, not its own organisation\'s', async () => {
      expect(await visible(adminA.client, 'audit_events')).toEqual([]);
      const own = await adminA.client.from('audit_events').select('id').eq('event_type', PROBE_EVENT);
      expect(own.error).toBeNull();
      expect(own.data).toEqual([]);
    });

    it('reads exactly the staff rows of its own organisation: no other organisation, no operator', async () => {
      const expected = [staffRow.adminA, staffRow.memberA, staffRow.bodyA, staffRow.auditorA, staffRow.suspendedA, staffRow.multiA];
      expect(sorted(await visible(adminA.client, 'staff'))).toEqual(sorted(expected));
    });

    it('does not see an operator row placed in its own organisation: platform staff are not tenant staff', async () => {
      expect(await visible(adminA.client, 'staff')).not.toContain(staffRow.operatorInA);
    });

    it('still resolves the other policies that subquery staff: reads its own organisation and not org B', async () => {
      const { data, error } = await adminA.client.from('organisations').select('id').in('id', [orgA, orgB, orgOp]);
      expect(error).toBeNull();
      expect(data).toEqual([{ id: orgA }]);
    });
  });

  describe('the other tenant (org B organiser_admin)', () => {
    it('reads exactly org B\'s staff rows, and none of org A\'s', async () => {
      expect(sorted(await visible(adminB.client, 'staff'))).toEqual(sorted([staffRow.adminB, staffRow.multiB]));
    });

    it('reads exactly its own users row and no audit_events', async () => {
      expect(await visible(adminB.client, 'users')).toEqual([adminB.id]);
      expect(await visible(adminB.client, 'audit_events')).toEqual([]);
    });
  });

  describe('a person who is admin of one organisation and only a member of another', () => {
    it('sees the admin organisation\'s whole team and, in the other organisation, only its own row', async () => {
      const expected = [
        staffRow.adminA, staffRow.memberA, staffRow.bodyA, staffRow.auditorA, staffRow.suspendedA, staffRow.multiA,
        staffRow.multiB,
      ];
      const seen = await visible(multi.client, 'staff');
      expect(sorted(seen)).toEqual(sorted(expected));
      expect(seen).not.toContain(staffRow.adminB);
    });
  });

  describe('non-admin staff of org A (organiser_member, body_admin, auditor)', () => {
    it.each([
      ['organiser_member', () => memberA, 'memberA'],
      ['body_admin', () => bodyA, 'bodyA'],
      ['auditor', () => auditorA, 'auditorA'],
    ] as const)('%s reads only its own staff row, its own users row and no audit_events', async (_role, who, key) => {
      const me = who();
      expect(await visible(me.client, 'staff')).toEqual([staffRow[key]]);
      expect(await visible(me.client, 'users')).toEqual([me.id]);
      expect(await visible(me.client, 'audit_events')).toEqual([]);
      for (const t of PERSON_TABLES) {
        expect((await visible(me.client, t, 'user_id')).filter((id) => id !== me.id), t).toEqual([]);
      }
    });
  });

  describe('a SUSPENDED org A admin', () => {
    it('reads only its own staff row: suspension removes the team view, not just the write path', async () => {
      expect(await visible(suspendedA.client, 'staff')).toEqual([staffRow.suspendedA]);
      expect(await visible(suspendedA.client, 'users')).toEqual([suspendedA.id]);
    });
  });

  describe('the platform operator (eventar_staff)', () => {
    it('reads every staff row of every organisation', async () => {
      const all = Object.values(staffRow);
      const { data, error } = await operator.client.from('staff').select('id').in('id', all);
      expect(error).toBeNull();
      expect(sorted((data ?? []).map((r) => r.id as string))).toEqual(sorted(all));
    });

    it('reads the users and every person-table row of people at any organisation', async () => {
      const ids = [person1.id, person2.id];
      const users = await operator.client.from('users').select('id').in('id', ids);
      expect(users.error).toBeNull();
      expect(sorted((users.data ?? []).map((r) => r.id as string))).toEqual(sorted(ids));
      for (const t of PERSON_TABLES) {
        const { data, error } = await operator.client.from(t).select('user_id').in('user_id', ids);
        expect(error, t).toBeNull();
        expect(sorted((data ?? []).map((r) => r.user_id as string)), t).toEqual(sorted(ids));
      }
    });

    it('reads the audit log, including an organisation-tagged event', async () => {
      const { data, error } = await operator.client.from('audit_events').select('organisation_id').eq('event_type', PROBE_EVENT);
      expect(error).toBeNull();
      expect(data).toEqual([{ organisation_id: orgA }]);
    });
  });

  describe('the person themself', () => {
    it('keeps reading their own users and person-table rows, and none of another person\'s', async () => {
      expect(await visible(person1.client, 'users')).toEqual([person1.id]);
      for (const t of PERSON_TABLES) {
        expect(await visible(person1.client, t, 'user_id'), t).toEqual([person1.id]);
      }
    });
  });

  describe('anon', () => {
    // Either no rows, or a refusal at the TABLE grant. Any other error (a wrong key, an unreachable API,
    // and for staff a missing EXECUTE grant on is_org_admin, which staff_self_read runs as anon because
    // it applies to PUBLIC) must fail the test.
    it.each(['users', 'audit_events', 'staff', ...PERSON_TABLES])('reads no %s row', async (table) => {
      const { data, error } = await createAnonClient().from(table).select('*').limit(5);
      if (error) expect(error.message).toMatch(/permission denied for table/i);
      else expect(data).toEqual([]);
    });
  });

  describe('catalog', () => {
    it('app_private.is_manager() is gone and no policy references it', async () => {
      const [r] = await sqlSuperuserQuery<{ gone: boolean; refs: string }>(
        `select to_regprocedure('app_private.is_manager()') is null as gone,
                (select count(*) from pg_policies where coalesce(qual,'') || coalesce(with_check,'') ~ 'is_manager')::text as refs`,
      );
      expect(r.gone).toBe(true);
      expect(r.refs).toBe('0');
    });

    it('app_private.is_org_admin(uuid) is executable by the roles that evaluate staff_self_read, and not by PUBLIC', async () => {
      const [r] = await sqlSuperuserQuery<{ acl_set: boolean; public_grants: string; anon: boolean; authenticated: boolean; service_role: boolean }>(
        `select p.proacl is not null as acl_set,
                (select count(*) from aclexplode(p.proacl) a where a.grantee = 0)::text as public_grants,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
                has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
           from pg_proc p where p.oid = to_regprocedure('app_private.is_org_admin(uuid)')`,
      );
      expect(r, 'app_private.is_org_admin(uuid) must exist').toBeDefined();
      expect(r.acl_set).toBe(true);
      expect(r.public_grants).toBe('0');
      expect([r.anon, r.authenticated, r.service_role]).toEqual([true, true, true]);
    });
  });
}, 180_000);
