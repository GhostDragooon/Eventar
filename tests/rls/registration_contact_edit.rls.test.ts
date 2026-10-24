// DB-05 (MVP plan, P6): an audited roster edit, and the registrations UPDATE bypass closed.
//
// `registrations_org_member_update` plus the default grants let any organisation member UPDATE any column of any
// registration of their organisation straight through PostgREST: mark someone attended outside the check-in window
// (DB-02), rewrite their name or email, change the code, with no audit row. The one legitimate edit (fix a registrant's
// name or email on the roster) is now update_registration_contact, a definer function that checks the actor, refuses
// to change the email of a registration linked to an account, refuses a clash, and writes the audit row last.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, createAnonClient, createTestUser, deleteTestUser, sqlSuperuserQuery, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const RUN = String(Date.now()).slice(-6);
const DAY = 86_400_000;

describe.skipIf(!process.env.RLS_TESTS)('audited roster edit and the registrations UPDATE bypass (DB-05)', () => {
  let owner: TestUser; // organiser_admin, default organisation
  let member: TestUser; // organiser_member, same organisation
  let operator: TestUser; // eventar_staff whose row sits in another organisation
  let otherAdmin: TestUser; // organiser_admin of another organisation
  let bodyAdmin: TestUser; // a role that is not allowed to edit the roster
  let account: TestUser; // an attendee with an Eventar account (a linked registration)
  let otherOrgId: string | undefined;
  let ownerStaffId: string;
  let eventId: string;
  const staffEmails: string[] = [];
  let seq = 0;

  async function addStaff(u: TestUser, role: string, organisation_id: string): Promise<string> {
    const { data, error } = await admin
      .from('staff')
      .insert({ email: u.email, role, full_name: `DB-05 ${role}`, organisation_id, status: 'active' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture ${role}: ${error?.message}`);
    staffEmails.push(u.email);
    return data.id as string;
  }

  async function makeReg(over: Record<string, unknown> = {}): Promise<{ id: string; email: string }> {
    seq += 1;
    const email = `db05-${RUN}-${seq}@rls-test.invalid`;
    const { data, error } = await admin
      .from('registrations')
      .insert({ event_id: eventId, email, full_name: `Original ${seq}`, registration_code: `WK-D5${RUN}${seq}`, ...over })
      .select('id, email')
      .single();
    if (error || !data) throw new Error(`registration fixture: ${error?.message}`);
    return { id: data.id as string, email: data.email as string };
  }

  const edit = (who: TestUser, registrationId: string, name: string, email: string) =>
    who.client.rpc('update_registration_contact', { p_registration_id: registrationId, p_full_name: name, p_email: email });
  const row = async (id: string) =>
    (await admin.from('registrations').select('full_name, email, status, check_in_at, check_in_method, registration_code, user_id').eq('id', id).single()).data!;
  const auditOf = async (id: string) =>
    (await admin.from('audit_events').select('event_type, actor_user_id, actor_role, organisation_id, subject_type, payload').eq('subject_id', id).eq('event_type', 'registration_contact_updated')).data ?? [];

  beforeAll(async () => {
    owner = await createTestUser(`roster-owner-${RUN}`);
    member = await createTestUser(`roster-member-${RUN}`);
    operator = await createTestUser(`roster-operator-${RUN}`);
    otherAdmin = await createTestUser(`roster-otheradmin-${RUN}`);
    bodyAdmin = await createTestUser(`roster-bodyadmin-${RUN}`);
    account = await createTestUser(`roster-account-${RUN}`);
    const { data: org2, error: org2Err } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org (roster other)', slug: `rls-roster-other-${RUN}` })
      .select('id')
      .single();
    if (org2Err || !org2) throw new Error(`other org fixture: ${org2Err?.message}`);
    otherOrgId = org2.id as string;
    ownerStaffId = await addStaff(owner, 'organiser_admin', DEFAULT_ORG);
    await addStaff(member, 'organiser_member', DEFAULT_ORG);
    await addStaff(operator, 'eventar_staff', otherOrgId);
    await addStaff(otherAdmin, 'organiser_admin', otherOrgId);
    await addStaff(bodyAdmin, 'body_admin', DEFAULT_ORG);
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: `DB-05 fixture ${RUN} — DELETE ME`,
        start_time: new Date(Date.now() + 3 * DAY).toISOString(),
        end_time: new Date(Date.now() + 3 * DAY + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong', created_by: ownerStaffId, venue_name: 'V', city: 'HK', country: 'HK',
        latitude: 22.3, longitude: 114.2, status: 'published', organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
    eventId = ev.id as string;
  }, 120_000);

  afterAll(async () => {
    if (eventId) {
      await mustDelete(admin.from('registrations').delete().eq('event_id', eventId), 'registrations fixture');
      await mustDelete(admin.from('events').delete().eq('id', eventId), 'event fixture');
    }
    for (const u of [owner, member, operator, otherAdmin, bodyAdmin, account]) {
      if (!u) continue;
      await mustDelete(admin.from('staff').delete().eq('email', u.email), 'staff fixture');
      await deleteTestUser(u);
    }
    if (otherOrgId) await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'other org fixture');
  }, 120_000);

  describe('update_registration_contact', () => {
    it('changes the name, keeps everything else, and writes one audit row naming the field and nothing else', async () => {
      const r = await makeReg();
      const before = await row(r.id);
      const done = await edit(owner, r.id, '  Corrected Name  ', r.email);
      expect(done.error).toBeNull();
      expect(done.data, 'returns the registration\'s event, so the caller refreshes the right pages').toBe(eventId);
      const after = await row(r.id);
      expect(after).toEqual({ ...before, full_name: 'Corrected Name' });
      const audit = await auditOf(r.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_user_id: owner.id, actor_role: 'organiser_admin', organisation_id: DEFAULT_ORG, subject_type: 'registration', payload: { fields: ['full_name'] } });
      expect(JSON.stringify(audit[0].payload)).not.toMatch(/Corrected|Original|rls-test/);
    });

    it('changes the email (stored lower-case), and both fields in one call; the code and the status do not move', async () => {
      const r = await makeReg();
      const before = await row(r.id);
      const newEmail = `db05-${RUN}-NEW${r.id.slice(0, 4)}@rls-test.invalid`;
      expect((await edit(member, r.id, 'Both Changed', newEmail)).error).toBeNull();
      const after = await row(r.id);
      expect(after.email).toBe(newEmail.toLowerCase());
      expect(after.full_name).toBe('Both Changed');
      expect(after.registration_code).toBe(before.registration_code);
      expect(after.status).toBe(before.status);
      expect((await auditOf(r.id))[0].payload).toEqual({ fields: ['full_name', 'email'] });
    });

    it('saving the same values changes nothing and writes no audit row', async () => {
      const r = await makeReg();
      const { full_name } = await row(r.id);
      expect((await edit(owner, r.id, full_name, r.email.toUpperCase())).error).toBeNull();
      expect(await auditOf(r.id)).toHaveLength(0);
    });

    it('a registration linked to an account keeps its email (linked_registration); its name can still be corrected', async () => {
      const r = await makeReg({ user_id: account.id });
      const refused = await edit(owner, r.id, 'Linked Name', `db05-${RUN}-other@rls-test.invalid`);
      expect(refused.error?.code).toBe('22023');
      expect(refused.error?.message).toMatch(/^linked_registration: /);
      expect((await row(r.id)).email).toBe(r.email);
      expect((await row(r.id)).full_name).not.toBe('Linked Name');
      expect(await auditOf(r.id)).toHaveLength(0);
      expect((await edit(owner, r.id, 'Linked Name', r.email)).error).toBeNull();
      expect((await row(r.id)).full_name).toBe('Linked Name');
    });

    it('a registration that gets linked while an edit waits is refused on the fresh row (the row lock)', async () => {
      // Connection A holds the registration row (as a claim would) and links it to an account; connection B edits the
      // email as the signed-in member and has to wait, then see the committed user_id.
      const r = await makeReg();
      const a = new Client({ connectionString: LOCAL_DB });
      const b = new Client({ connectionString: LOCAL_DB });
      try {
        await a.connect();
        await b.connect();
        await a.query('begin');
        await a.query('select id from public.registrations where id = $1 for no key update', [r.id]);
        await b.query('begin');
        await b.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', email: member.email })]);
        await b.query('set local role authenticated');
        const pending = b
          .query('select public.update_registration_contact($1, $2, $3)', [r.id, 'Late edit', `db05-${RUN}-late@rls-test.invalid`])
          .then(() => ({ ok: true as const }), (e: { code?: string; message: string }) => ({ ok: false as const, code: e.code, message: e.message }));
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          const { rows } = await a.query(
            `select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid() and query like '%update_registration_contact%'`,
          );
          waiting = rows[0].n > 0;
          if (!waiting) await new Promise((res) => setTimeout(res, 50));
        }
        expect(waiting, 'the edit never waited on the row lock, so this test would prove nothing').toBe(true);
        await a.query('update public.registrations set user_id = $1 where id = $2', [account.id, r.id]);
        await a.query('commit');
        const res = await pending;
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.code).toBe('22023');
        expect(res.ok === false && res.message).toMatch(/^linked_registration: /);
      } finally {
        await b.query('rollback').catch(() => undefined);
        await a.query('rollback').catch(() => undefined);
        await a.end();
        await b.end();
      }
      expect((await row(r.id)).email).toBe(r.email);
    }, 30_000);

    it('a registration deleted while an edit waits is not found: no success, no audit row', async () => {
      // Connection A deletes the row (as service_role erasure would) and holds the lock; B edits as the member, waits on
      // the row, then finds it gone.
      const r = await makeReg();
      const a = new Client({ connectionString: LOCAL_DB });
      const b = new Client({ connectionString: LOCAL_DB });
      try {
        await a.connect();
        await b.connect();
        await a.query('begin');
        await a.query('delete from public.registrations where id = $1', [r.id]);
        await b.query('begin');
        await b.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', email: member.email })]);
        await b.query('set local role authenticated');
        const pending = b
          .query('select public.update_registration_contact($1, $2, $3)', [r.id, 'Too late', r.email])
          .then(() => ({ ok: true as const }), (e: { code?: string; message: string }) => ({ ok: false as const, code: e.code, message: e.message }));
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          const { rows } = await a.query(
            `select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid() and query like '%update_registration_contact%'`,
          );
          waiting = rows[0].n > 0;
          if (!waiting) await new Promise((res) => setTimeout(res, 50));
        }
        expect(waiting, 'the edit never waited on the row lock, so this test would prove nothing').toBe(true);
        await a.query('commit');
        const res = await pending;
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.code).toBe('P0002');
      } finally {
        await b.query('rollback').catch(() => undefined);
        await a.query('rollback').catch(() => undefined);
        await a.end();
        await b.end();
      }
      expect(await auditOf(r.id)).toHaveLength(0);
    }, 30_000);

    it('an email another registrant of the event already uses is refused (already_registered), nothing changes', async () => {
      const a = await makeReg();
      const b = await makeReg();
      const refused = await edit(owner, a.id, 'Clash', b.email);
      expect(refused.error?.code).toBe('23505');
      expect(refused.error?.message).toMatch(/^already_registered: /);
      expect(await row(a.id)).toMatchObject({ email: a.email, full_name: expect.stringMatching(/^Original/) });
      expect(await auditOf(a.id)).toHaveLength(0);
    });

    it.each([
      ['an empty name', '   ', 'ok@rls-test.invalid', /^invalid_name: /],
      ['a name over 200 characters', 'x'.repeat(201), 'ok@rls-test.invalid', /^invalid_name: /],
      ['an email without an @', 'Fine', 'not-an-email', /^invalid_email: /],
      ['an email with a space', 'Fine', 'a b@rls-test.invalid', /^invalid_email: /],
      ['an email with an empty domain label', 'Fine', 'a@..b', /^invalid_email: /],
      ['an email over 254 characters', 'Fine', `${'x'.repeat(250)}@a.bc`, /^invalid_email: /],
      ['a name of only tabs and newlines', '\t\n ', 'ok@rls-test.invalid', /^invalid_name: /],
    ])('refuses %s', async (_label, name, email, message) => {
      const r = await makeReg();
      const res = await edit(owner, r.id, name, email);
      expect(res.error?.code).toBe('22023');
      expect(res.error?.message).toMatch(message);
      expect(await auditOf(r.id)).toHaveLength(0);
    });

    it("another organisation's admin is refused (42501) and an unknown registration is not found (P0002)", async () => {
      const r = await makeReg();
      const refused = await edit(otherAdmin, r.id, 'Not yours', r.email);
      expect(refused.error?.code).toBe('42501');
      expect(refused.error?.message).toMatch(/not in your organisation/);
      const missing = await edit(owner, '00000000-0000-4000-8000-0000000000ee', 'Nobody', 'nobody@rls-test.invalid');
      expect(missing.error?.code).toBe('P0002');
      expect((await row(r.id)).full_name).toMatch(/^Original/);
    });

    it('the platform operator (eventar_staff) may correct any organisation\'s roster', async () => {
      const r = await makeReg();
      expect((await edit(operator, r.id, 'Operator fix', r.email)).error).toBeNull();
      expect((await row(r.id)).full_name).toBe('Operator fix');
      expect((await auditOf(r.id))[0]).toMatchObject({ actor_user_id: operator.id, actor_role: 'eventar_staff', organisation_id: DEFAULT_ORG });
    });

    it('p_actor_override is inert for a signed-in caller: another organisation\'s admin cannot borrow an owner\'s staff id', async () => {
      const r = await makeReg();
      const res = await otherAdmin.client.rpc('update_registration_contact', {
        p_registration_id: r.id, p_full_name: 'Borrowed', p_email: r.email, p_actor_override: ownerStaffId,
      });
      expect(res.error?.code).toBe('42501');
      expect(res.error?.message).toMatch(/not in your organisation/);
      expect((await row(r.id)).full_name).toMatch(/^Original/);
    });

    it('writes the audit row last: after the UPDATE, once, and nothing but the return follows it', async () => {
      const [fn] = await sqlSuperuserQuery<{ src: string }>(`select prosrc as src from pg_proc where proname = 'update_registration_contact'`);
      const update = fn.src.indexOf('update public.registrations set');
      const audit = fn.src.indexOf('write_audit_event(');
      expect(update, 'the UPDATE is in the function body').toBeGreaterThan(-1);
      expect(audit, 'the audit call is after the UPDATE').toBeGreaterThan(update);
      expect(fn.src.lastIndexOf('write_audit_event('), 'and it is the only audit call').toBe(audit);
      expect(fn.src.slice(audit).replace(/\s+/g, ' ').trim()).toMatch(/^write_audit_event\(.*\); return v_event; end;$/);
    });

    it('a body admin and an anonymous caller may not', async () => {
      const r = await makeReg();
      const body = await edit(bodyAdmin, r.id, 'Body fix', r.email);
      expect(body.error?.code).toBe('42501');
      const anon = await createAnonClient().rpc('update_registration_contact', { p_registration_id: r.id, p_full_name: 'Anon', p_email: r.email });
      expect(anon.error?.code).toBe('42501');
      expect(anon.error?.message ?? '', 'must be the grant layer, not the function body').toMatch(/permission denied for function update_registration_contact/i);
      expect((await row(r.id)).full_name).toMatch(/^Original/);
    });

    it('a soft-deleted event\'s roster is not editable', async () => {
      const { data: ev } = await admin
        .from('events')
        .insert({
          title: `DB-05 deleted ${RUN} — DELETE ME`, start_time: new Date(Date.now() + 3 * DAY).toISOString(),
          end_time: new Date(Date.now() + 3 * DAY + 3_600_000).toISOString(), timezone: 'Asia/Hong_Kong',
          created_by: ownerStaffId, venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
          status: 'published', organisation_id: DEFAULT_ORG, deleted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      const deletedEvent = ev!.id as string;
      try {
        const { data: reg } = await admin
          .from('registrations')
          .insert({ event_id: deletedEvent, email: `db05-del-${RUN}@rls-test.invalid`, full_name: 'Gone', registration_code: `WK-DX${RUN}` })
          .select('id')
          .single();
        const res = await edit(owner, reg!.id as string, 'Edited', `db05-del-${RUN}@rls-test.invalid`);
        expect(res.error?.code).toBe('P0002');
      } finally {
        await mustDelete(admin.from('registrations').delete().eq('event_id', deletedEvent), 'registrations fixture');
        await mustDelete(admin.from('events').delete().eq('id', deletedEvent), 'deleted event fixture');
      }
    });
  });

  describe('the direct UPDATE on registrations is closed', () => {
    it('authenticated holds no UPDATE on registrations (table or any column); service_role keeps it; the policy is gone', async () => {
      const [row1] = await sqlSuperuserQuery<{ tbl: boolean; col: boolean; anon: boolean; svc: boolean; pol: number }>(
        `select has_table_privilege('authenticated', 'public.registrations', 'UPDATE') as tbl,
                has_any_column_privilege('authenticated', 'public.registrations', 'UPDATE') as col,
                has_any_column_privilege('anon', 'public.registrations', 'UPDATE') as anon,
                has_table_privilege('service_role', 'public.registrations', 'UPDATE') as svc,
                (select count(*)::int from pg_policies where tablename = 'registrations' and cmd in ('UPDATE', 'ALL')) as pol`,
      );
      expect(row1.tbl, 'authenticated holds table UPDATE on registrations | Fix in a NEW migration: revoke update on public.registrations from anon, authenticated').toBe(false);
      expect(row1.col, 'authenticated holds a column UPDATE on registrations').toBe(false);
      expect(row1.anon).toBe(false);
      expect(row1.svc, 'service_role must keep UPDATE (cancel, claim, scripts, teardown)').toBe(true);
      expect(row1.pol, 'registrations_org_member_update should be dropped').toBe(0);
    });

    it('a colleague DELETE of a registration is refused by the grant (42501), not answered with an empty 200', async () => {
      const r = await makeReg();
      const res = await member.client.from('registrations').delete().eq('id', r.id).select('id');
      expect(res.error?.code).toBe('42501');
      expect(res.error?.message ?? '').toMatch(/permission denied for table registrations/i);
      expect(await row(r.id)).toBeTruthy();
    });

    it.each([
      ['status', { status: 'attended' }],
      ['check_in_at', { check_in_at: new Date().toISOString() }],
      ['full_name', { full_name: 'Direct edit' }],
      ['registration_code', { registration_code: 'WK-HIJACK' }],
    ])('a colleague PATCHing registrations.%s is refused by the grant (42501) and the row is unchanged', async (_col, patch) => {
      const r = await makeReg();
      const before = await row(r.id);
      const res = await member.client.from('registrations').update(patch).eq('id', r.id).select('id');
      expect(res.error?.code).toBe('42501');
      expect(res.error?.message ?? '', 'must be the grant layer, not RLS').toMatch(/permission denied for table registrations/i);
      expect(await row(r.id)).toEqual(before);
    });
  });
});
