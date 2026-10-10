// Cross-tenant erasure / DSR authority (found 2026-10-09; decided by Ivan 2026-10-10).
//
// pseudonymise_user(p_user_id, …) and transition_dsr(p_id, …) are SECURITY DEFINER and were
// gated by ROLE only ('organiser_admin' or 'eventar_staff'), with no relation between the
// caller and the target; dsr_staff_all gave the same role-only reach to the table itself.
// Executed as org A's organiser_admin JWT, an unrelated attendee was erased, another
// subject's erasure request was moved, and the same request was PATCHed and DELETEd directly
// with no audit event. The gate was the single-organisation 'manager' role translated
// one-to-one by the 2026-07-09 role remap; the multi-tenant pivot never revisited it.
//
// Decided 2026-10-10:
//   * ERASURE (pseudonymise_user) is platform-only: an active eventar_staff. An organisation
//     can manufacture the link that would otherwise authorise it (a guest registration with
//     the person's email, linked when the person presses "Claim past events"), and the effect
//     lands on the shared identity row that every organisation's exports read.
//   * DSR PROCESSING (transition_dsr) and READING the table are scoped to the subject's
//     organisation: an organiser_admin acts only on a person with an account-linked
//     registration (registrations.user_id) at an event of their own organisation;
//     eventar_staff is unscoped. One helper, app_private.staff_for_subject(uuid), answers
//     "which staff row authorises this caller for this subject?" for the function and for the
//     SELECT policy, so the two cannot drift apart.
//   * App roles cannot write the table at all (Hard Rule 11): transition_dsr is the only
//     audited way to change a request, and the only direct INSERT is a person filing their
//     own request, column-limited. The grant matrix row lives in audited_table_writes.
//
// Every denial asserts the specific SQLSTATE 42501 (not "an error occurred") AND reads the
// state back with the service-role client, so a refusal that still changed something fails.
//
// Gated on RLS_TESTS. Local stack only: tests/helpers/clients.ts refuses otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const ts = Date.now();
const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const PERMISSION_DENIED = '42501';
const UNKNOWN_ID = '00000000-0000-0000-0000-00000000dead';

describe.skipIf(!process.env.RLS_TESTS)('DSR + erasure authority: erasure is platform-only, DSR handling is scoped to the subject\'s organisation', () => {
  let orgA: string;
  let orgB: string;
  const staffIds: Record<string, string> = {};
  const staffEmails: string[] = [];
  const eventIds: string[] = [];
  const dsrIds: string[] = [];
  const users: TestUser[] = [];

  // Staff (each has a real JWT client; the staff row is keyed on the same email).
  let adminA: TestUser; // organiser_admin, org A
  let adminB: TestUser; // organiser_admin, org B
  let memberA: TestUser; // organiser_member, org A (right org, wrong role)
  let platform: TestUser; // eventar_staff, active
  let opSuspended: TestUser; // eventar_staff, status 'suspended'
  let adminMulti: TestUser; // organiser_admin in org B (older row) AND org A (newer row)
  let adminSuspended: TestUser; // organiser_admin of org A, but status 'suspended'
  let adminMixed: TestUser; // organiser_member in org A AND organiser_admin in org B
  // Subjects.
  let subjRelDenied: TestUser; // registered at an org A event; carries the related-subject DSR rows
  let subjRelMember: TestUser; // registered at an org A event; org A's organiser_member tries to erase
  let subjRelErase: TestUser; // registered at an org A event; org A's ADMIN tries to erase (platform-only)
  let subjUnrelated: TestUser; // registered only at an org B event
  let subjPlatform: TestUser; // no registration anywhere; erased by the platform operator
  let subjOpSuspended: TestUser; // no registration anywhere; the suspended operator tries to erase
  let subjRelMulti: TestUser; // registered at an org A event; request moved by the multi-organisation admin
  let subjGuestOnly: TestUser; // only a GUEST registration (user_id null, same email) at an org A event
  let subjRelSuspended: TestUser; // registered at an org A event; its request is hidden from the suspended admin
  let subjRelMixed: TestUser; // registered at an org A event only
  // DSR rows.
  let dsrRelOk: string; // related: org A's admin may move it
  let dsrOtherOrg: string; // related to org A: org B's admin must not move it
  let dsrMember: string; // related to org A: org A's organiser_member must not move it
  let dsrRepoint: string; // related: nobody may re-point it directly
  let dsrRelPatch: string; // related: nobody may PATCH it directly
  let dsrRelDelete: string; // related: nobody may DELETE it directly
  let dsrUnrelFn: string; // unrelated: refused through the function
  let dsrUnrelUpdate: string; // unrelated: refused through a direct PATCH
  let dsrUnrelDelete: string; // unrelated: refused through a direct DELETE
  let dsrUnrelPlatform: string; // unrelated: the platform operator may move it
  let dsrSuspended: string; // related (org A): a suspended org A admin must not see or move it
  let dsrMixed: string; // related (org A only): the member-in-A / admin-in-B person must not move it
  let dsrMulti: string; // related (org A): the multi-organisation admin moves it
  let dsrGuestOnly: string; // guest-only subject: not related
  let dsrErasureClose: string; // related subject, ERASURE request: an org admin may hand it on, not close it
  let dsrAccessClose: string; // related subject, ACCESS request: an org admin may close it
  let dsrErasurePlatform: string; // unrelated subject, ERASURE request: the platform operator may close it

  async function mkUser(localPart: string): Promise<TestUser> {
    const u = await createTestUser(`${localPart}-${ts}`);
    users.push(u);
    return u;
  }

  async function mkStaff(
    user: TestUser,
    role: 'organiser_admin' | 'organiser_member' | 'eventar_staff',
    organisationId: string,
    status: 'active' | 'suspended' = 'active',
  ): Promise<void> {
    const { data, error } = await admin
      .from('staff')
      .insert({ email: user.email, role, full_name: 'DSR scope fixture', organisation_id: organisationId, status })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture (${role}): ${error?.message}`);
    staffIds[user.email] = data.id as string;
    staffEmails.push(user.email);
  }

  async function mkOrg(label: string): Promise<string> {
    const { data, error } = await admin
      .from('organisations')
      .insert({ name: `DSR scope ${label} ${ts}`, slug: `dsr-scope-${label}-${ts}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`organisation ${label}: ${error?.message}`);
    return data.id as string;
  }

  async function mkEventWithRegistration(
    createdBy: string,
    expectedOrg: string,
    subject: TestUser,
    n: number,
    linked = true,
  ): Promise<void> {
    const { data: ev, error } = await admin
      .from('events')
      .insert({
        title: 'DSR scope fixture — DELETE ME',
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
    // Guard against a vacuous fixture: the whole suite hangs on this event belonging to expectedOrg.
    if (ev.organisation_id !== expectedOrg) {
      throw new Error(`event fixture landed in ${ev.organisation_id}, expected ${expectedOrg}`);
    }
    const reg = await admin.from('registrations').insert({
      event_id: ev.id,
      ...(linked ? { user_id: subject.id } : {}),
      email: subject.email,
      full_name: 'DSR scope subject',
      registration_code: `WK-DS${n}${String(ts).slice(-5)}`,
    });
    if (reg.error) throw new Error(`registration fixture: ${reg.error.message}`);
  }

  async function mkDsr(subject: TestUser, requestType: 'erasure' | 'access' = 'erasure'): Promise<string> {
    const { data, error } = await admin
      .from('data_subject_requests')
      .insert({ subject_user_id: subject.id, request_type: requestType, status: 'pending' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`dsr fixture: ${error?.message}`);
    dsrIds.push(data.id as string);
    return data.id as string;
  }

  async function userRow(id: string) {
    const { data } = await admin.from('users').select('full_name, pseudonymised_at, deleted_at').eq('id', id).single();
    return data;
  }
  async function dsrRow(id: string) {
    const { data } = await admin
      .from('data_subject_requests')
      .select('status, subject_user_id, resolver_staff_id')
      .eq('id', id)
      .maybeSingle();
    return data;
  }
  async function audit(eventType: string, subjectId: string) {
    const { data } = await admin
      .from('audit_events')
      .select('event_type, actor_role, actor_user_id, organisation_id, subject_id')
      .eq('event_type', eventType)
      .eq('subject_id', subjectId);
    return data ?? [];
  }

  beforeAll(async () => {
    orgA = await mkOrg('a');
    orgB = await mkOrg('b');

    adminA = await mkUser('dsr-scope-admin-a');
    adminB = await mkUser('dsr-scope-admin-b');
    memberA = await mkUser('dsr-scope-member-a');
    platform = await mkUser('dsr-scope-platform');
    opSuspended = await mkUser('dsr-scope-op-suspended');
    adminMulti = await mkUser('dsr-scope-admin-multi');
    adminSuspended = await mkUser('dsr-scope-admin-suspended');
    adminMixed = await mkUser('dsr-scope-admin-mixed');
    subjRelDenied = await mkUser('dsr-scope-rel-denied');
    subjRelMember = await mkUser('dsr-scope-rel-member');
    subjRelErase = await mkUser('dsr-scope-rel-erase');
    subjUnrelated = await mkUser('dsr-scope-unrelated');
    subjPlatform = await mkUser('dsr-scope-platform-target');
    subjOpSuspended = await mkUser('dsr-scope-op-suspended-target');
    subjRelMulti = await mkUser('dsr-scope-rel-multi');
    subjGuestOnly = await mkUser('dsr-scope-guest-only');
    subjRelSuspended = await mkUser('dsr-scope-rel-suspended');
    subjRelMixed = await mkUser('dsr-scope-rel-mixed');

    await mkStaff(adminA, 'organiser_admin', orgA);
    await mkStaff(adminB, 'organiser_admin', orgB);
    await mkStaff(memberA, 'organiser_member', orgA);
    await mkStaff(platform, 'eventar_staff', DEFAULT_ORG);
    await mkStaff(opSuspended, 'eventar_staff', DEFAULT_ORG, 'suspended');
    // adminMulti: the org B row is created FIRST (older), then the org A row (the one that matters).
    await mkStaff(adminMulti, 'organiser_admin', orgB);
    await mkStaff(adminMulti, 'organiser_admin', orgA);
    await mkStaff(adminSuspended, 'organiser_admin', orgA, 'suspended');
    // adminMixed holds the RIGHT organisation with the WRONG role and the RIGHT role in the WRONG organisation.
    await mkStaff(adminMixed, 'organiser_member', orgA);
    await mkStaff(adminMixed, 'organiser_admin', orgB);

    // Org A's events hold the related subjects; org B's event holds the unrelated one.
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelDenied, 1);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelErase, 2);
    await mkEventWithRegistration(staffIds[adminB.email], orgB, subjUnrelated, 3);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelMember, 4);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelMulti, 5);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjGuestOnly, 6, false);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelSuspended, 7);
    await mkEventWithRegistration(staffIds[adminA.email], orgA, subjRelMixed, 8);

    dsrRelOk = await mkDsr(subjRelDenied);
    dsrOtherOrg = await mkDsr(subjRelDenied);
    dsrMember = await mkDsr(subjRelDenied);
    dsrRepoint = await mkDsr(subjRelDenied, 'access');
    dsrRelPatch = await mkDsr(subjRelDenied);
    dsrRelDelete = await mkDsr(subjRelDenied);
    dsrUnrelFn = await mkDsr(subjUnrelated);
    dsrUnrelUpdate = await mkDsr(subjUnrelated);
    dsrUnrelDelete = await mkDsr(subjUnrelated);
    dsrUnrelPlatform = await mkDsr(subjUnrelated);
    dsrSuspended = await mkDsr(subjRelSuspended);
    dsrMixed = await mkDsr(subjRelMixed);
    dsrMulti = await mkDsr(subjRelMulti);
    dsrGuestOnly = await mkDsr(subjGuestOnly);
    dsrErasureClose = await mkDsr(subjRelDenied, 'erasure');
    dsrAccessClose = await mkDsr(subjRelDenied, 'access');
    dsrErasurePlatform = await mkDsr(subjUnrelated, 'erasure');
  }, 180_000);

  afterAll(async () => {
    if (dsrIds.length) {
      await mustDelete(admin.from('data_subject_requests').delete().in('id', dsrIds), 'data_subject_requests');
    }
    if (eventIds.length) {
      await mustDelete(admin.from('registrations').delete().in('event_id', eventIds), 'registrations');
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events');
    }
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), `staff ${email}`);
    }
    for (const org of [orgA, orgB]) {
      if (org) await mustDelete(admin.from('organisations').delete().eq('id', org), 'organisations');
    }
    for (const u of users) await deleteTestUser(u);
  }, 180_000);

  // ---------------------------------------------------------------- pseudonymise_user
  describe('pseudonymise_user: active platform staff (eventar_staff) only', () => {
    it('refuses an organiser_admin for a subject registered at ANOTHER organisation (42501) and changes nothing', async () => {
      const { error } = await adminA.client.rpc('pseudonymise_user', { p_user_id: subjUnrelated.id, p_reason: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);

      const row = await userRow(subjUnrelated.id);
      expect(row?.pseudonymised_at).toBeNull();
      expect(row?.deleted_at).toBeNull();
      expect(row?.full_name).not.toMatch(/^ERASED-/);
      expect(await audit('user_pseudonymised', subjUnrelated.id)).toHaveLength(0);
    });

    it("refuses an organiser_admin even for a subject registered at their OWN organisation's event: erasure is platform-only (42501)", async () => {
      const { error } = await adminA.client.rpc('pseudonymise_user', { p_user_id: subjRelErase.id, p_reason: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);

      const row = await userRow(subjRelErase.id);
      expect(row?.pseudonymised_at).toBeNull();
      expect(row?.full_name).not.toMatch(/^ERASED-/);
      expect(await audit('user_pseudonymised', subjRelErase.id)).toHaveLength(0);
    });

    it('answers an unknown user id exactly like a real one for a non-platform caller (42501, same message)', async () => {
      const known = await adminA.client.rpc('pseudonymise_user', { p_user_id: subjUnrelated.id, p_reason: 'scope-test' });
      const unknown = await adminA.client.rpc('pseudonymise_user', { p_user_id: UNKNOWN_ID, p_reason: 'scope-test' });
      expect(unknown.error?.code).toBe(PERMISSION_DENIED);
      expect(unknown.error?.message).toBe(known.error?.message);
    });

    it('refuses an organiser_member of the subject\'s organisation (42501)', async () => {
      const { error } = await memberA.client.rpc('pseudonymise_user', { p_user_id: subjRelMember.id, p_reason: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      const row = await userRow(subjRelMember.id);
      expect(row?.pseudonymised_at).toBeNull();
      expect(row?.full_name).not.toMatch(/^ERASED-/);
    });

    it('refuses a SUSPENDED platform operator (42501): only active staff count', async () => {
      const { error } = await opSuspended.client.rpc('pseudonymise_user', { p_user_id: subjOpSuspended.id, p_reason: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      const row = await userRow(subjOpSuspended.id);
      expect(row?.pseudonymised_at).toBeNull();
      expect(row?.full_name).not.toMatch(/^ERASED-/);
    });

    it('lets the active platform operator erase a subject with no registration anywhere; the audit event names the operator', async () => {
      const { error } = await platform.client.rpc('pseudonymise_user', { p_user_id: subjPlatform.id, p_reason: 'scope-test platform erasure' });
      expect(error).toBeNull();

      const row = await userRow(subjPlatform.id);
      expect(row?.full_name).toMatch(/^ERASED-[0-9a-f]{12}$/);
      expect(row?.pseudonymised_at).not.toBeNull();

      const events = await audit('user_pseudonymised', subjPlatform.id);
      expect(events).toHaveLength(1);
      expect(events[0].actor_role).toBe('eventar_staff');
      expect(events[0].actor_user_id).toBe(platform.id);
      expect(events[0].organisation_id).toBe(DEFAULT_ORG);
    });
  });

  // ---------------------------------------------------------------- transition_dsr
  describe('transition_dsr: scoped to the subject\'s organisation', () => {
    it("refuses an organiser_admin for an unrelated subject's request (42501); no state change, no audit event", async () => {
      const { error } = await adminA.client.rpc('transition_dsr', { p_id: dsrUnrelFn, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);

      const row = await dsrRow(dsrUnrelFn);
      expect(row?.status).toBe('pending');
      expect(row?.resolver_staff_id).toBeNull();
      expect(await audit('dsr_transitioned', dsrUnrelFn)).toHaveLength(0);
    });

    it('answers an unknown request id exactly like an unrelated one (42501, same message): no existence oracle', async () => {
      const unrelated = await adminA.client.rpc('transition_dsr', { p_id: dsrUnrelFn, p_status: 'in_progress' });
      const unknown = await adminA.client.rpc('transition_dsr', { p_id: UNKNOWN_ID, p_status: 'in_progress' });
      expect(unknown.error?.code).toBe(PERMISSION_DENIED);
      expect(unknown.error?.message).toBe(unrelated.error?.message);
    });

    it("refuses an organiser_admin of a DIFFERENT organisation than the subject's (42501)", async () => {
      const { error } = await adminB.client.rpc('transition_dsr', { p_id: dsrOtherOrg, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrOtherOrg))?.status).toBe('pending');
    });

    it("refuses an organiser_member of the RELATED organisation: the role gate and the relation both apply (42501)", async () => {
      const { error } = await memberA.client.rpc('transition_dsr', { p_id: dsrMember, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrMember))?.status).toBe('pending');
    });

    it('refuses a SUSPENDED organiser_admin of the related organisation (42501) and hides the request from them: only active staff count', async () => {
      const { error } = await adminSuspended.client.rpc('transition_dsr', { p_id: dsrSuspended, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrSuspended))?.status).toBe('pending');

      const hidden = await adminSuspended.client.from('data_subject_requests').select('id').eq('id', dsrSuspended);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
      // Control: an ACTIVE admin of the same organisation does see it, so the line above is not vacuous.
      const visible = await adminA.client.from('data_subject_requests').select('id').eq('id', dsrSuspended);
      expect(visible.data).toEqual([{ id: dsrSuspended }]);
    });

    it('refuses a person who is organiser_member of the related organisation and organiser_admin of an unrelated one (42501): role and relation must hold on the SAME staff row', async () => {
      const { error } = await adminMixed.client.rpc('transition_dsr', { p_id: dsrMixed, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrMixed))?.status).toBe('pending');
    });

    it('does not relate a subject through a guest registration (user_id null) even when the email matches (42501)', async () => {
      const { error } = await adminA.client.rpc('transition_dsr', { p_id: dsrGuestOnly, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrGuestOnly))?.status).toBe('pending');
    });

    it("lets an organiser_admin move a related subject's request; resolver is that admin and the audit event names the organisation", async () => {
      const { error } = await adminA.client.rpc('transition_dsr', { p_id: dsrRelOk, p_status: 'in_progress', p_notes: 'scope-test' });
      expect(error).toBeNull();

      const row = await dsrRow(dsrRelOk);
      expect(row?.status).toBe('in_progress');
      expect(row?.resolver_staff_id).toBe(staffIds[adminA.email]);

      const events = await audit('dsr_transitioned', dsrRelOk);
      expect(events).toHaveLength(1);
      expect(events[0].organisation_id).toBe(orgA);
    });

    it('attributes the transition to the organisation the authority came from when the caller administers several (older row is another organisation)', async () => {
      const { error } = await adminMulti.client.rpc('transition_dsr', { p_id: dsrMulti, p_status: 'in_progress', p_notes: 'scope-test attribution' });
      expect(error).toBeNull();

      // staffIds[adminMulti.email] holds the org A row (the second insert).
      expect((await dsrRow(dsrMulti))?.resolver_staff_id).toBe(staffIds[adminMulti.email]);
      const events = await audit('dsr_transitioned', dsrMulti);
      expect(events).toHaveLength(1);
      expect(events[0].organisation_id).toBe(orgA); // not orgB, whose staff row is older
    });

    it("leaves the platform operator unscoped: it can move any subject's request", async () => {
      const { error } = await platform.client.rpc('transition_dsr', { p_id: dsrUnrelPlatform, p_status: 'in_progress' });
      expect(error).toBeNull();
      expect((await dsrRow(dsrUnrelPlatform))?.status).toBe('in_progress');
    });

    // An organisation admin cannot erase (platform-only), so the record must not let them say it
    // was erased, or refuse a request only the platform can act on. They can hand it on.
    it('lets an organiser_admin hand an ERASURE request on (escalated) but not complete or reject it (42501): only platform staff can close it', async () => {
      for (const terminal of ['completed', 'rejected']) {
        const { error } = await adminA.client.rpc('transition_dsr', { p_id: dsrErasureClose, p_status: terminal, p_notes: 'scope-test' });
        expect(error?.code, `erasure request -> ${terminal}`).toBe(PERMISSION_DENIED);
        expect((await dsrRow(dsrErasureClose))?.status, `still pending after ${terminal}`).toBe('pending');
      }
      const handOn = await adminA.client.rpc('transition_dsr', { p_id: dsrErasureClose, p_status: 'escalated', p_notes: 'asked the platform operator' });
      expect(handOn.error).toBeNull();
      expect((await dsrRow(dsrErasureClose))?.status).toBe('escalated');
    });

    it('still lets an organiser_admin complete a NON-erasure request of a related subject', async () => {
      const { error } = await adminA.client.rpc('transition_dsr', { p_id: dsrAccessClose, p_status: 'completed', p_notes: 'export sent' });
      expect(error).toBeNull();
      expect((await dsrRow(dsrAccessClose))?.status).toBe('completed');
    });

    it('lets the platform operator complete an ERASURE request', async () => {
      const { error } = await platform.client.rpc('transition_dsr', { p_id: dsrErasurePlatform, p_status: 'completed', p_notes: 'scope-test' });
      expect(error).toBeNull();
      expect((await dsrRow(dsrErasurePlatform))?.status).toBe('completed');
    });
  });

  // ---------------------------------------------------------------- the table itself
  // The path a function-only fix would have missed. dsr_staff_all let any organiser_admin
  // SELECT / INSERT / UPDATE / DELETE every row directly, unaudited (executed 2026-10-10), and
  // even after org-scoping it let a linked admin close, backdate, re-attribute or delete a
  // request with no audit event. Now: staff may only READ the requests of their own
  // organisation's subjects; nobody but service_role writes except a person filing their own.
  describe('data_subject_requests, accessed directly', () => {
    it("shows an organiser_admin the requests of their own organisation's subjects and none of an unrelated subject's", async () => {
      const { data, error } = await adminA.client.from('data_subject_requests').select('id');
      expect(error).toBeNull();
      const visible = new Set((data ?? []).map((r) => r.id as string));
      expect(visible.has(dsrRelOk)).toBe(true);
      for (const hidden of [dsrUnrelFn, dsrUnrelUpdate, dsrUnrelDelete, dsrUnrelPlatform]) {
        expect(visible.has(hidden)).toBe(false);
      }
    });

    it('cannot PATCH a request directly, related or not (42501 at the grant): transition_dsr is the only way', async () => {
      for (const id of [dsrRelPatch, dsrUnrelUpdate]) {
        const { error } = await adminA.client
          .from('data_subject_requests')
          .update({ status: 'completed', resolution_notes: 'direct-write probe' })
          .eq('id', id)
          .select('id');
        expect(error?.code, `PATCH ${id}`).toBe(PERMISSION_DENIED);
        expect(error?.message, `PATCH ${id}`).toMatch(/permission denied/i);
        expect((await dsrRow(id))?.status).toBe('pending');
      }
    });

    it('cannot DELETE a request directly, related or not (42501 at the grant): the row survives', async () => {
      for (const id of [dsrRelDelete, dsrUnrelDelete]) {
        const { error } = await adminA.client.from('data_subject_requests').delete().eq('id', id).select('id');
        expect(error?.code, `DELETE ${id}`).toBe(PERMISSION_DENIED);
        expect(error?.message, `DELETE ${id}`).toMatch(/permission denied/i);
        expect(await dsrRow(id)).not.toBeNull();
      }
    });

    it('cannot re-point a request at another subject (42501)', async () => {
      const { error } = await adminA.client
        .from('data_subject_requests')
        .update({ subject_user_id: subjUnrelated.id })
        .eq('id', dsrRepoint);
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((await dsrRow(dsrRepoint))?.subject_user_id).toBe(subjRelDenied.id);
    });

    it('cannot file a request for anyone but themselves, staff included (42501): staff intake belongs to the future console', async () => {
      for (const subject of [subjUnrelated, subjRelDenied]) {
        const { error } = await adminA.client
          .from('data_subject_requests')
          .insert({ subject_user_id: subject.id, request_type: 'access' });
        expect(error?.code, `file for ${subject.email}`).toBe(PERMISSION_DENIED);
      }
    });
  });
});
