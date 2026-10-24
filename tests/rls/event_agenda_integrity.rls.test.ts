// DB-04 (MVP plan, P4/O3): an agenda save never loses or duplicates anything, and a published event is not edited.
//
// update_event_with_blocks used to delete every agenda block and re-insert the payload. Now it is a per-block
// upsert keyed by block id (display_order is the payload index), refuses to remove a block that a survey answer
// points at, and refuses any event that is not a draft. The draft-only rule also holds below the RPC: a BEFORE
// UPDATE trigger on events (the detail columns `authenticated` can UPDATE) and a write guard on agenda_blocks.
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
const HOUR = 3_600_000;

type Block = { id: string; title: string; display_order: number };

describe.skipIf(!process.env.RLS_TESTS)('agenda save integrity and draft-only edits (DB-04)', () => {
  let owner: TestUser; // organiser_admin, default organisation
  let member: TestUser; // organiser_member, same organisation
  let platform: TestUser; // eventar_staff whose row sits in the default organisation
  let otherAdmin: TestUser; // organiser_admin of another organisation
  let operator: TestUser; // eventar_staff whose row sits in another organisation
  let ownerStaffId: string;
  let otherOrgId: string | undefined;
  const staffEmails: string[] = [];
  const eventIds: string[] = [];

  async function addStaff(u: TestUser, role: string, organisation_id: string): Promise<string> {
    const { data, error } = await admin
      .from('staff')
      .insert({ email: u.email, role, full_name: `DB-04 ${role}`, organisation_id, status: 'active' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture ${role}: ${error?.message}`);
    staffEmails.push(u.email);
    return data.id as string;
  }

  const start = () => Date.now() + 3 * DAY;
  const eventInput = (over: Record<string, unknown> = {}) => ({
    title: `DB-04 saved ${RUN} — DELETE ME`,
    start_time: new Date(start()).toISOString(),
    end_time: new Date(start() + 4 * HOUR).toISOString(),
    timezone: 'Asia/Hong_Kong', venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
    ...over,
  });
  const blockInput = (title: string, slot: number, id?: string, over: Record<string, unknown> = {}) => ({
    ...(id ? { id } : {}),
    start_time: new Date(start() + slot * HOUR).toISOString(),
    end_time: new Date(start() + (slot + 1) * HOUR).toISOString(),
    kind: 'lecture', title, host: '', topics: [], notes: '', display_order: 99,
    ...over,
  });

  async function makeEvent(status: 'draft' | 'published', blocks: string[] = []): Promise<{ id: string; blockIds: string[] }> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title: `DB-04 fixture ${RUN} — DELETE ME`,
        start_time: new Date(start()).toISOString(),
        end_time: new Date(start() + 4 * HOUR).toISOString(),
        timezone: 'Asia/Hong_Kong', created_by: ownerStaffId,
        venue_name: 'V0', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status, organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`event fixture: ${error?.message}`);
    const id = data.id as string;
    eventIds.push(id);
    const blockIds: string[] = [];
    for (const [i, title] of blocks.entries()) {
      const { data: b, error: be } = await admin
        .from('agenda_blocks')
        .insert({ event_id: id, ...blockInput(title, i), display_order: i })
        .select('id')
        .single();
      if (be || !b) throw new Error(`block fixture: ${be?.message}`);
      blockIds.push(b.id as string);
    }
    return { id, blockIds };
  }

  async function blocksOf(eventId: string): Promise<Block[]> {
    const { data, error } = await admin.from('agenda_blocks').select('id, title, display_order').eq('event_id', eventId).order('display_order');
    if (error) throw new Error(error.message);
    return (data ?? []) as Block[];
  }
  const save = (who: TestUser, eventId: string, blocks: unknown[], over: Record<string, unknown> = {}) =>
    who.client.rpc('update_event_with_blocks', { event_id_input: eventId, event_input: eventInput(over), blocks_input: blocks });
  const titleOf = async (eventId: string) =>
    (await admin.from('events').select('title').eq('id', eventId).single()).data?.title as string;

  // A registration whose survey answer points at the block: the thing the RPC and the agenda guard must protect.
  async function answerAbout(eventId: string, blockId: string, tag: string): Promise<string> {
    const { data: reg, error: regErr } = await admin
      .from('registrations')
      .insert({ event_id: eventId, email: `agenda-${tag}-${RUN}@rls-test.invalid`, full_name: 'Agenda Probe', registration_code: `WK-A${tag}${RUN}` })
      .select('id')
      .single();
    if (regErr || !reg) throw new Error(`registration fixture: ${regErr?.message}`);
    const { error: surveyErr } = await admin.from('survey_responses').insert({ registration_id: reg.id, event_id: eventId, valuable_block_id: blockId });
    if (surveyErr) throw new Error(`survey fixture: ${surveyErr.message}`);
    return reg.id as string;
  }
  const surveyBlockOf = async (registrationId: string) =>
    (await admin.from('survey_responses').select('valuable_block_id').eq('registration_id', registrationId).single()).data?.valuable_block_id;

  beforeAll(async () => {
    owner = await createTestUser(`agenda-owner-${RUN}`);
    member = await createTestUser(`agenda-member-${RUN}`);
    platform = await createTestUser(`agenda-platform-${RUN}`);
    otherAdmin = await createTestUser(`agenda-otheradmin-${RUN}`);
    operator = await createTestUser(`agenda-operator-${RUN}`);
    const { data: org2, error: org2Err } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org (agenda other)', slug: `rls-agenda-other-${RUN}` })
      .select('id')
      .single();
    if (org2Err || !org2) throw new Error(`other org fixture: ${org2Err?.message}`);
    otherOrgId = org2.id as string;
    ownerStaffId = await addStaff(owner, 'organiser_admin', DEFAULT_ORG);
    await addStaff(member, 'organiser_member', DEFAULT_ORG);
    await addStaff(platform, 'eventar_staff', DEFAULT_ORG);
    await addStaff(otherAdmin, 'organiser_admin', otherOrgId);
    await addStaff(operator, 'eventar_staff', otherOrgId);
  }, 120_000);

  afterAll(async () => {
    if (eventIds.length > 0) {
      await mustDelete(admin.from('registrations').delete().in('event_id', eventIds), 'registrations fixture');
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
    }
    for (const u of [owner, member, platform, otherAdmin, operator]) {
      if (!u) continue;
      await mustDelete(admin.from('staff').delete().eq('email', u.email), 'staff fixture');
      await deleteTestUser(u);
    }
    if (otherOrgId) await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'other org fixture');
  }, 120_000);

  describe('the save is a per-block upsert keyed by block id', () => {
    it('saving twice with the same blocks changes nothing: same ids, no duplicates', async () => {
      const { id, blockIds: [a, b] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      for (let i = 0; i < 2; i++) {
        const { error } = await save(owner, id, [blockInput('Alpha', 0, a), blockInput('Bravo', 1, b)]);
        expect(error).toBeNull();
      }
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([a, b]);
    });

    it('a block without an id is inserted once; sent back with its id the next save does not duplicate it', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      expect((await save(owner, id, [blockInput('Alpha', 0, a), blockInput('Charlie', 1)])).error).toBeNull();
      const afterFirst = await blocksOf(id);
      expect(afterFirst.map((r) => r.title)).toEqual(['Alpha', 'Charlie']);
      const charlie = afterFirst[1].id;
      expect((await save(owner, id, [blockInput('Alpha', 0, a), blockInput('Charlie', 1, charlie)])).error).toBeNull();
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([a, charlie]);
    });

    it('every field of an existing block is saved, not only its position', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      const changed = blockInput('Alpha renamed', 2, a, {
        kind: 'workshop', host: 'Dr Chan', notes: 'Bring a laptop', topics: [{ name: 'Imaging' }], sponsored: true, sponsor_name: 'Acme',
      });
      expect((await save(owner, id, [changed])).error).toBeNull();
      const { data } = await admin
        .from('agenda_blocks')
        .select('title, kind, host, notes, topics, sponsored, sponsor_name, start_time, end_time')
        .eq('id', a)
        .single();
      expect(data).toMatchObject({ title: 'Alpha renamed', kind: 'workshop', host: 'Dr Chan', notes: 'Bring a laptop', topics: [{ name: 'Imaging' }], sponsored: true, sponsor_name: 'Acme' });
      expect(new Date(data!.start_time as string).toISOString()).toBe(changed.start_time);
      expect(new Date(data!.end_time as string).toISOString()).toBe(changed.end_time);
    });

    it('a block sent without topics, or with null topics, is stored with an empty list (as on create)', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      const { topics: _omit, ...noTopics } = blockInput('No topics', 1) as Record<string, unknown>;
      void _omit;
      expect((await save(owner, id, [blockInput('Alpha', 0, a, { topics: null }), noTopics])).error).toBeNull();
      const { data } = await admin.from('agenda_blocks').select('title, topics').eq('event_id', id).order('display_order');
      expect(data).toEqual([{ title: 'Alpha', topics: [] }, { title: 'No topics', topics: [] }]);
    });

    it('display_order is the payload index, whatever the caller sent, and reordering keeps the ids', async () => {
      const { id, blockIds: [a, b] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      expect((await save(owner, id, [blockInput('Bravo', 1, b, { display_order: 7 }), blockInput('Alpha', 0, a, { display_order: 3 })])).error).toBeNull();
      expect(await blocksOf(id)).toEqual([
        { id: b, title: 'Bravo', display_order: 0 },
        { id: a, title: 'Alpha', display_order: 1 },
      ]);
    });

    it('a block left out of the payload is removed', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      expect((await save(owner, id, [blockInput('Alpha', 0, a)])).error).toBeNull();
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([a]);
    });

    it('a block a survey answer points at cannot be removed: block_has_survey_answers, and the whole save is undone', async () => {
      const { id, blockIds: [a, b] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      const regId = await answerAbout(id, b, 'S');

      const { error } = await save(owner, id, [blockInput('Alpha', 0, a)], { title: 'DB-04 must not be saved' });
      expect(error?.code).toBe('22023');
      expect(error?.message).toBe('block_has_survey_answers: Bravo');
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([a, b]);
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
      expect(await surveyBlockOf(regId)).toBe(b);
    });

    it('the RPC itself refuses to remove an answered block for server code too (service_role skips the triggers)', async () => {
      const { id, blockIds: [a, b] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      const regId = await answerAbout(id, b, 'R');
      const { error } = await admin.rpc('update_event_with_blocks', { event_id_input: id, event_input: eventInput({ title: 'DB-04 must not be saved' }), blocks_input: [blockInput('Alpha', 0, a)] });
      expect(error?.code).toBe('22023');
      expect(error?.message).toBe('block_has_survey_answers: Bravo');
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([a, b]);
      expect(await surveyBlockOf(regId)).toBe(b);
    });

    it("a block id from another event is refused", async () => {
      const { id } = await makeEvent('draft', ['Alpha']);
      const { id: otherEvent, blockIds: [foreign] } = await makeEvent('draft', ['Elsewhere']);
      const { error } = await save(owner, id, [blockInput('Stolen', 0, foreign)]);
      expect(error?.code).toBe('22023');
      expect(error?.message).toMatch(/is not part of event/);
      expect((await blocksOf(otherEvent)).map((r) => r.title)).toEqual(['Elsewhere']);
    });

    it('the same block id twice in one payload is refused', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      const { error } = await save(owner, id, [blockInput('Alpha', 0, a), blockInput('Alpha again', 1, a)]);
      expect(error?.code).toBe('22023');
      expect(error?.message).toMatch(/appears twice/);
    });

    it('a soft-deleted draft is not found by the RPC either, nothing is saved', async () => {
      const { id } = await makeEvent('draft', ['Alpha']);
      await admin.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      const { error } = await save(owner, id, [blockInput('Nope', 0)], { title: 'DB-04 must not be saved' });
      expect(error?.code).toBe('P0001');
      expect(error?.message).toMatch(/not found or not visible/);
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
    });

    it('a payload that is not an array is refused and nothing is saved', async () => {
      const { id } = await makeEvent('draft', ['Alpha']);
      const { error } = await owner.client.rpc('update_event_with_blocks', { event_id_input: id, event_input: eventInput({ title: 'DB-04 nope' }), blocks_input: { not: 'an array' } });
      expect(error?.code).toBe('22023');
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
      expect(await blocksOf(id)).toHaveLength(1);
    });
  });

  describe('a published event is not edited, whoever asks', () => {
    it.each([['organiser_admin'], ['organiser_member'], ['eventar_staff']] as const)('the RPC refuses a published event for %s: event_not_draft, nothing changes', async (role) => {
      const who = { organiser_admin: owner, organiser_member: member, eventar_staff: platform }[role];
      const { id, blockIds: [a] } = await makeEvent('published', ['Alpha']);
      const { error } = await save(who, id, [blockInput('Changed', 0, a), blockInput('Added', 1)], { title: 'DB-04 must not be saved' });
      expect(error?.code).toBe('22023');
      expect(error?.message).toMatch(/^event_not_draft: /);
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
      expect(await blocksOf(id)).toEqual([{ id: a, title: 'Alpha', display_order: 0 }]);
    });

    it('the RPC refuses a published event for server code too (service_role skips the triggers, so this is the RPC\'s own check)', async () => {
      const { id, blockIds: [a] } = await makeEvent('published', ['Alpha']);
      const { error } = await admin.rpc('update_event_with_blocks', {
        event_id_input: id, event_input: eventInput({ title: 'DB-04 must not be saved' }), blocks_input: [blockInput('Changed', 0, a)],
      });
      expect(error?.code).toBe('22023');
      expect(error?.message).toMatch(/^event_not_draft: /);
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
      expect(await blocksOf(id)).toEqual([{ id: a, title: 'Alpha', display_order: 0 }]);
    });

    it("another organisation's staff get a clean 42501 on an event they can see, and learn nothing about a draft they cannot", async () => {
      // The platform operator reads every organisation's drafts (events_manager_read_all) but may not edit them:
      // there is no UPDATE policy for that, so the RPC says so plainly. Another organisation's admin reads only the
      // published event, so on a draft it is "not found" (no existence leak).
      const { id: draft } = await makeEvent('draft', ['Alpha']);
      const { id: published } = await makeEvent('published', ['Alpha']);
      for (const [who, eventId] of [[operator, draft], [operator, published], [otherAdmin, published]] as const) {
        const { error } = await save(who, eventId, [blockInput('Nope', 0)]);
        expect(error?.code).toBe('42501');
        expect(error?.message).toMatch(/is not in your organisation/);
      }
      const hidden = await save(otherAdmin, draft, [blockInput('Nope', 0)]);
      expect(hidden.error?.code).toBe('P0001');
      expect(hidden.error?.message).toMatch(/not found or not visible/);
      expect((await blocksOf(draft)).map((r) => r.title)).toEqual(['Alpha']);
      expect((await blocksOf(published)).map((r) => r.title)).toEqual(['Alpha']);
    });

    it('a publish that lands while a save is waiting wins: the save is refused, not applied on top', async () => {
      // Connection A holds the row lock (as the start of a publish would) and publishes; connection B calls the
      // RPC as the signed-in member and must wait on the row, then see the committed status. No agenda blocks, so the
      // only write at stake is the events row: the agenda guard cannot be what refuses it.
      const { id } = await makeEvent('draft');
      const a = new Client({ connectionString: LOCAL_DB });
      const b = new Client({ connectionString: LOCAL_DB });
      await a.connect();
      await b.connect();
      try {
        await a.query('begin');
        await a.query('select id from public.events where id = $1 for no key update', [id]); // what publish_event's UPDATE takes
        await b.query('begin');
        await b.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', email: member.email })]);
        await b.query('set local role authenticated');
        const pending = b
          .query('select public.update_event_with_blocks($1, $2::jsonb, $3::jsonb)', [id, JSON.stringify(eventInput({ title: 'DB-04 late edit' })), '[]'])
          .then(() => ({ ok: true as const }), (e: { code?: string; message: string }) => ({ ok: false as const, code: e.code, message: e.message }));
        for (let i = 0; i < 100; i++) {
          const { rows } = await a.query(
            `select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid() and query like '%update_event_with_blocks%'`,
          );
          if (rows[0].n > 0) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        await a.query(`update public.events set status = 'published', published_at = now() where id = $1`, [id]);
        await a.query('commit');
        const res = await pending;
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.code).toBe('22023');
        expect(res.ok === false && res.message).toMatch(/^event_not_draft: /);
      } finally {
        await b.query('rollback').catch(() => undefined);
        await a.query('rollback').catch(() => undefined);
        await a.end();
        await b.end();
      }
      expect(await titleOf(id)).toBe(`DB-04 fixture ${RUN} — DELETE ME`);
    }, 30_000);
  });

  describe('below the RPC: a signed-in user cannot edit a published event through PostgREST either', () => {
    // One value per column `authenticated` can UPDATE, each different from the fixture's. The list is checked
    // against the live grants, so a column granted later without the trigger covering it fails here.
    const PROTECTED: Record<string, unknown> = {
      title: 'DB-04 patched', topic: 'patched', start_time: new Date(start() + 2 * DAY).toISOString(),
      end_time: new Date(start() + 2 * DAY + 3 * HOUR).toISOString(), timezone: 'Asia/Tokyo', description: 'patched',
      poster_path: 'patched.png', max_attendees: 77, venue_name: 'patched', venue_address: 'patched', city: 'Patched',
      region: 'patched', country: 'JP', latitude: 1.5, longitude: 2.5, hosted_by: [{ name: 'patched' }],
      organized_by: [{ name: 'patched' }], hero_image_url: 'https://patched.invalid/x.png', category: 'patched',
      format: 'patched', checkin_modes: { staff: true, self_serve: true }, registration_open_at: new Date(start() - DAY).toISOString(),
    };

    it('the protected list is exactly the columns authenticated can UPDATE, less registration_close_at', async () => {
      const rows = await sqlSuperuserQuery<{ attname: string }>(
        `select attname from pg_attribute where attrelid = 'public.events'::regclass and attnum > 0 and not attisdropped
            and has_column_privilege('authenticated', 'public.events', attname, 'UPDATE') order by attname`,
      );
      expect(rows.map((r) => r.attname).filter((c) => c !== 'registration_close_at').sort()).toEqual(Object.keys(PROTECTED).sort());
    });

    it.each(Object.keys(PROTECTED))('PATCH events.%s on a published event is refused (event_not_draft) and nothing changes', async (col) => {
      const { id } = await makeEvent('published');
      const before = (await admin.from('events').select(col).eq('id', id).single()).data as unknown as Record<string, unknown>;
      const { error } = await member.client.from('events').update({ [col]: PROTECTED[col] }).eq('id', id);
      expect(error?.code).toBe('22023');
      expect(error?.message).toMatch(/^event_not_draft: /);
      const after = (await admin.from('events').select(col).eq('id', id).single()).data as unknown as Record<string, unknown>;
      expect(after[col]).toEqual(before[col]);
    });

    it('registration_close_at stays editable on a published event (the Close registration editor)', async () => {
      const { id } = await makeEvent('published');
      const when = new Date(start() - HOUR).toISOString();
      const { data, error } = await member.client.from('events').update({ registration_close_at: when }).eq('id', id).select('registration_close_at').single();
      expect(error).toBeNull();
      expect(new Date(data!.registration_close_at as string).toISOString()).toBe(when);
    });

    it('the same PATCH on a draft is allowed (control)', async () => {
      const { id } = await makeEvent('draft');
      const { error } = await member.client.from('events').update({ title: 'DB-04 draft patched', venue_name: 'patched', max_attendees: 5 }).eq('id', id);
      expect(error).toBeNull();
      expect(await titleOf(id)).toBe('DB-04 draft patched');
    });

    it('server code (service_role) and the publish function still work on the same events (control)', async () => {
      const { id } = await makeEvent('published');
      const { error } = await admin.from('events').update({ title: 'DB-04 server edit' }).eq('id', id);
      expect(error).toBeNull();
      const { id: draft } = await makeEvent('draft');
      const { error: pubErr } = await owner.client.rpc('publish_event', { p_event_id: draft });
      expect(pubErr).toBeNull();
      expect((await admin.from('events').select('status').eq('id', draft).single()).data?.status).toBe('published');
    });

    it('agenda_blocks: INSERT, UPDATE and DELETE by a signed-in user are refused on a published event', async () => {
      const { id, blockIds: [a] } = await makeEvent('published', ['Alpha']);
      const ins = await member.client.from('agenda_blocks').insert({ event_id: id, ...blockInput('Sneaked in', 2), display_order: 5 });
      expect(ins.error?.code).toBe('22023');
      const upd = await member.client.from('agenda_blocks').update({ title: 'Renamed' }).eq('id', a);
      expect(upd.error?.code).toBe('22023');
      const del = await member.client.from('agenda_blocks').delete().eq('id', a);
      expect(del.error?.code).toBe('22023');
      expect(await blocksOf(id)).toEqual([{ id: a, title: 'Alpha', display_order: 0 }]);
    });

    it('agenda_blocks: a signed-in user can still write to a draft, and service_role to a published event (control)', async () => {
      const { id, blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      expect((await member.client.from('agenda_blocks').insert({ event_id: id, ...blockInput('Added', 2), display_order: 5 })).error).toBeNull();
      expect((await member.client.from('agenda_blocks').update({ title: 'Renamed' }).eq('id', a)).error).toBeNull();
      expect((await member.client.from('agenda_blocks').delete().eq('id', a)).error).toBeNull();
      const { id: pub } = await makeEvent('published', ['Alpha']);
      expect((await admin.from('agenda_blocks').insert({ event_id: pub, ...blockInput('Seeded', 2), display_order: 5 })).error).toBeNull();
    });

    it('agenda_blocks: a block cannot be moved off a published event onto a draft either', async () => {
      const { id: pub, blockIds: [a] } = await makeEvent('published', ['Alpha']);
      const { id: draft } = await makeEvent('draft');
      const { error } = await member.client.from('agenda_blocks').update({ event_id: draft }).eq('id', a);
      expect(error?.code).toBe('22023');
      expect((await blocksOf(pub)).map((r) => r.id)).toEqual([a]);
    });

    it('agenda_blocks: a direct DELETE of a block a survey answer points at is refused too, on a draft', async () => {
      const { id, blockIds: [a, b] } = await makeEvent('draft', ['Alpha', 'Bravo']);
      const regId = await answerAbout(id, b, 'D');
      const refused = await member.client.from('agenda_blocks').delete().eq('id', b);
      expect(refused.error?.code).toBe('22023');
      expect(refused.error?.message).toBe('block_has_survey_answers: Bravo');
      expect((await member.client.from('agenda_blocks').delete().eq('id', a)).error).toBeNull(); // an unanswered one still goes
      expect((await blocksOf(id)).map((r) => r.id)).toEqual([b]);
      expect(await surveyBlockOf(regId)).toBe(b);
    });

    it('the RPC is not executable by anon', async () => {
      const { id } = await makeEvent('draft');
      const { error } = await createAnonClient().rpc('update_event_with_blocks', { event_id_input: id, event_input: eventInput(), blocks_input: [] });
      expect(error?.code).toBe('42501');
    });

    it('agenda_blocks: a block cannot be moved from a draft onto a published event', async () => {
      const { blockIds: [a] } = await makeEvent('draft', ['Alpha']);
      const { id: pub } = await makeEvent('published');
      const { error } = await member.client.from('agenda_blocks').update({ event_id: pub }).eq('id', a);
      expect(error?.code).toBe('22023');
    });
  });
});
