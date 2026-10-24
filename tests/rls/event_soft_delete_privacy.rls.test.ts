// DB-03 (MVP plan, O6): a soft-deleted event is private.
//
// softDeleteEvents only sets events.deleted_at and leaves status = 'published', and the public read policy
// events_public_read_published was just `status = 'published'`, so the event page, its poster, the agenda and
// the listing's data stayed readable by anyone with the anon key. The rule now lives in the one choke point,
// the policy: `status = 'published' and deleted_at is null`. Everything that reads an event through RLS inherits
// it (agenda_blocks, event_occurrences and registrations' INSERT policy select from events as the caller).
// Organisation members keep seeing their own deleted events through their own policies (undo, audit).
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const RUN = String(Date.now()).slice(-6);

describe.skipIf(!process.env.RLS_TESTS)('a soft-deleted event is private (DB-03)', () => {
  const anon = createAnonClient();
  let member: TestUser;
  let otherOrgStaff: TestUser; // staff of a DIFFERENT organisation: must be as blind to the deleted event as anon
  let otherOrgId: string | undefined;
  let staffId: string;
  let liveId: string;
  let deletedId: string;
  let draftId: string;
  const created: string[] = [];

  async function makeEvent(title: string, deleted: boolean, status: 'published' | 'draft' = 'published'): Promise<string> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title,
        start_time: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
        venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status,
        organisation_id: DEFAULT_ORG,
        deleted_at: deleted ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`event fixture: ${error?.message}`);
    created.push(data.id as string); // tracked before anything else can fail, so cleanup always sees it
    // One agenda block each, so the dependent public read can be proven too.
    const { error: blockErr } = await admin.from('agenda_blocks').insert({
      event_id: data.id,
      start_time: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      end_time: new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString(),
      kind: 'workshop', title: `${title} block`, host: '', topics: [], notes: '', display_order: 0,
    });
    if (blockErr) throw new Error(`agenda fixture: ${blockErr.message}`);
    return data.id as string;
  }

  beforeAll(async () => {
    member = await createTestUser(`softdel-member-${RUN}`);
    const { data, error } = await admin
      .from('staff')
      .insert({ email: member.email, role: 'organiser_member', full_name: 'SoftDel Member', organisation_id: DEFAULT_ORG, status: 'active' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture: ${error?.message}`);
    staffId = data.id as string;
    liveId = await makeEvent(`DB-03 live ${RUN} — DELETE ME`, false);
    deletedId = await makeEvent(`DB-03 deleted ${RUN} — DELETE ME`, true);
    draftId = await makeEvent(`DB-03 draft ${RUN} — DELETE ME`, false, 'draft');

    otherOrgStaff = await createTestUser(`softdel-otherorg-${RUN}`);
    const { data: org2, error: org2Err } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org (soft-delete other)', slug: `rls-softdel-other-${RUN}` })
      .select('id')
      .single();
    if (org2Err || !org2) throw new Error(`other org fixture: ${org2Err?.message}`);
    otherOrgId = org2.id as string;
    const { error: otherStaffErr } = await admin
      .from('staff')
      .insert({ email: otherOrgStaff.email, role: 'organiser_admin', full_name: 'SoftDel Other Org', organisation_id: otherOrgId, status: 'active' });
    if (otherStaffErr) throw new Error(`other org staff fixture: ${otherStaffErr.message}`);
  }, 60_000);

  afterAll(async () => {
    if (created.length > 0) await mustDelete(admin.from('events').delete().in('id', created), 'events fixture');
    if (otherOrgStaff) {
      await mustDelete(admin.from('staff').delete().eq('email', otherOrgStaff.email), 'other org staff fixture');
      await deleteTestUser(otherOrgStaff);
    }
    if (otherOrgId) await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'other org fixture');
    if (member) {
      await mustDelete(admin.from('staff').delete().eq('email', member.email), 'staff fixture');
      await deleteTestUser(member);
    }
  }, 60_000);

  it('anon reads a published event that is not deleted (control: the policy still serves the public)', async () => {
    const { data, error } = await anon.from('events').select('id').eq('id', liveId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('anon reads nothing for a soft-deleted published event', async () => {
    const { data, error } = await anon.from('events').select('id').eq('id', deletedId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // Guards the other half of the predicate: a policy rewritten to `deleted_at is null` alone would publish every draft.
  it('a listing of live, deleted and draft events shows anon only the live published one', async () => {
    const { data } = await anon.from('events').select('id').in('id', [liveId, deletedId, draftId]);
    expect((data ?? []).map((r) => r.id)).toEqual([liveId]);
  });

  it('its agenda and occurrences are private too (their policies select from events as the caller)', async () => {
    for (const table of ['agenda_blocks', 'event_occurrences'] as const) {
      const { data: live } = await anon.from(table).select('id').eq('event_id', liveId);
      expect(live?.length, `${table} of the live event`).toBeGreaterThan(0);
      const { data: gone } = await anon.from(table).select('id').eq('event_id', deletedId);
      expect(gone, `${table} of the deleted event`).toHaveLength(0);
    }
  });

  it("staff of another organisation reads nothing for the deleted event, as blind as anon", async () => {
    const { data } = await otherOrgStaff.client.from('events').select('id').in('id', [liveId, deletedId, draftId]);
    expect((data ?? []).map((r) => r.id)).toEqual([liveId]);
  });

  it('an organisation member still sees their own deleted event (undo and audit need it)', async () => {
    const { data, error } = await member.client.from('events').select('id, deleted_at').eq('id', deletedId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].deleted_at).not.toBeNull();
  });

  it('a signed-in person outside the organisation (authenticated, not staff) reads nothing for the deleted event', async () => {
    const outsider = await createTestUser(`softdel-outsider-${RUN}`);
    try {
      const { data } = await outsider.client.from('events').select('id').in('id', [liveId, deletedId]);
      expect((data ?? []).map((r) => r.id)).toEqual([liveId]);
    } finally {
      await deleteTestUser(outsider);
    }
  }, 30_000);

  it('the registrations INSERT policy no longer treats a soft-deleted event as published, even for staff who can still see it (defence in depth)', async () => {
    // Anon and authenticated no longer hold INSERT on registrations (SEC-01), so reach the policy the way the
    // forgery tests do: a rolled-back transaction that grants it back on purpose. The caller is a STAFF member
    // of the organisation (JWT email claim), because for anyone else the events subquery already hides the
    // deleted event and the policy's own predicate would never be exercised.
    const { insertAsRoleWithGrant } = await import('../helpers/insertAsRole');
    const row = (eventId: string, code: string) => ({
      event_id: eventId, email: `${code.toLowerCase()}@rls-test.invalid`, full_name: 'SoftDel Probe', registration_code: code,
    });
    const claims = { role: 'authenticated', email: member.email };
    expect(await insertAsRoleWithGrant('authenticated', 'registrations', row(liveId, `WK-SD${RUN}A`), claims)).toEqual({ ok: true });
    const refused = await insertAsRoleWithGrant('authenticated', 'registrations', row(deletedId, `WK-SD${RUN}B`), claims);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.code).toBe('42501');
    expect(refused.ok === false && refused.message).toMatch(/row-level security/i);
  }, 30_000);
});
