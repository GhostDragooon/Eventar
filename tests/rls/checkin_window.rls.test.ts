// DB-02 (MVP plan, P3): check-in only inside the live window, at the database.
//
// Before 20261023170000, mark_attended resolved the occurrence with "the one containing now(), else, if the event
// has exactly one occurrence, that one at any time", so a staff scan or manual code check-in minted attendance
// (and a credit) days before or after the event. self_check_in already had an event-level window but matched
// occurrences strictly. The rule now, in both functions: with ONE occurrence (every event the product creates)
// the EVENT's own window decides, [start_time - 60 min, end_time], because events.start_time and end_time are
// what an organiser edits and nothing moves the occurrence row with them; with several occurrences each is open
// from 60 minutes before its start until its end. Outside the window the result is `not_open_yet` or `closed`
// and nothing is written: no check-in row, no evidence row, no audit event, status untouched. Where several
// windows overlap, an occurrence that has already started wins over one that is only pre-opening.
//
// Fixtures are disposable (events, registrations, one staff user) and cleaned up; audit events are permanent by
// design. Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, createTestUser, deleteTestUser, sqlSuperuser, sqlSuperuserQuery, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const RUN = String(Date.now()).slice(-6);

type Fx = { eventId: string; code: string; regId: string };
type Win = [startMin: number, endMin: number];

describe.skipIf(!process.env.RLS_TESTS)('check-in only inside the live window (DB-02)', () => {
  let owner: TestUser;
  let ownerStaffId: string;
  const eventIds: string[] = [];
  const regIds: string[] = [];
  const rateKeys: string[] = [];
  let n = 0;

  const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  // One event whose single auto-created occurrence spans the event (startMin..endMin minutes from now).
  async function fixture(startMin: number, endMin: number, opts: { selfServe?: boolean } = {}): Promise<Fx> {
    const { data: ev, error } = await admin
      .from('events')
      .insert({
        title: 'DB-02 window fixture — DELETE ME',
        start_time: minutes(startMin),
        end_time: minutes(endMin),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
        venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status: 'published',
        organisation_id: DEFAULT_ORG,
        checkin_modes: { staff: true, self_serve: opts.selfServe ?? false },
      })
      .select('id')
      .single();
    if (error || !ev) throw new Error(`event fixture: ${error?.message}`);
    const eventId = ev.id as string;
    eventIds.push(eventId);
    rateKeys.push(`markAttended:${eventId}`, `selfCheckIn:${eventId}`);

    const code = `WK-CW${RUN}${String(++n).padStart(2, '0')}`;
    const { data: reg, error: regErr } = await admin
      .from('registrations')
      .insert({ event_id: eventId, email: `${code.toLowerCase()}@rls-test.invalid`, full_name: 'Window Attendee', registration_code: code })
      .select('id')
      .single();
    if (regErr || !reg) throw new Error(`registration fixture: ${regErr?.message}`);
    regIds.push(reg.id as string);
    return { eventId, code, regId: reg.id as string };
  }

  // Replace the event's occurrences (definer-only table: postgres connection, local only). Returns their ids in order.
  async function occurrences(eventId: string, wins: Win[]): Promise<string[]> {
    await sqlSuperuser(`delete from public.event_occurrences where event_id = '${eventId}'`);
    const ids: string[] = [];
    for (const [i, [s, e]] of wins.entries()) {
      const rows = await sqlSuperuserQuery<{ id: string }>(
        `insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
         values ('${eventId}', ${i + 1}, 'day', now() + interval '${s} minutes', now() + interval '${e} minutes') returning id`,
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  async function mark(code: string): Promise<{ result: string }> {
    const { data, error } = await owner.client.rpc('mark_attended', { p_code: code, p_method: 'qr' });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    return { result: row.result };
  }

  async function selfCheckIn(code: string): Promise<string> {
    const { data, error } = await admin.rpc('self_check_in', { p_code: code, p_ip: '127.0.0.1' });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    return row.result;
  }

  async function writes(regId: string) {
    const { data: checkins } = await admin.from('registration_checkins').select('occurrence_id').eq('registration_id', regId);
    const { data: evidence } = await admin.from('participation_evidence').select('id').eq('registration_id', regId);
    const { data: audit } = await admin.from('audit_events').select('id').eq('subject_id', regId).eq('event_type', 'attendee_checked_in');
    const { data: reg } = await admin.from('registrations').select('status').eq('id', regId).single();
    return { checkins: checkins ?? [], evidence: evidence ?? [], audit: audit ?? [], status: reg?.status as string };
  }

  async function expectNothingWritten(regId: string) {
    const w = await writes(regId);
    expect(w.checkins, 'no check-in row').toHaveLength(0);
    expect(w.evidence, 'no evidence row').toHaveLength(0);
    expect(w.audit, 'no audit event').toHaveLength(0);
    expect(w.status, 'status untouched').toBe('registered');
  }

  beforeAll(async () => {
    owner = await createTestUser(`checkin-window-owner-${RUN}`);
    const { data, error } = await admin
      .from('staff')
      .insert({ email: owner.email, role: 'organiser_member', full_name: 'Window Owner', organisation_id: DEFAULT_ORG, status: 'active' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture: ${error?.message}`);
    ownerStaffId = data.id as string;
  }, 60_000);

  afterEach(async () => {
    if (eventIds.length > 0) await admin.from('participation_evidence').delete().in('event_id', eventIds);
    if (regIds.length > 0) await mustDelete(admin.from('registrations').delete().in('id', regIds), 'registrations fixture');
    if (eventIds.length > 0) await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
    if (rateKeys.length > 0) await mustDelete(admin.from('rate_limits').delete().in('key', rateKeys), 'rate_limits fixture');
    regIds.length = 0;
    eventIds.length = 0;
    rateKeys.length = 0;
  }, 60_000);

  afterAll(async () => {
    await mustDelete(admin.from('staff').delete().eq('email', owner.email), 'staff fixture');
    await deleteTestUser(owner);
  }, 60_000);

  describe('mark_attended (staff scan or typed code)', () => {
    it('before the pre-open: not_open_yet, and nothing is written', async () => {
      const f = await fixture(120, 180);
      expect((await mark(f.code)).result).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });

    it('inside the 60-minute pre-open: one check-in and its evidence and audit event', async () => {
      const f = await fixture(50, 110);
      expect((await mark(f.code)).result).toBe('ok');
      const w = await writes(f.regId);
      expect(w.checkins).toHaveLength(1);
      expect(w.evidence).toHaveLength(1);
      expect(w.audit).toHaveLength(1);
      expect(w.status).toBe('attended');
    });

    // The edge of the pre-open, 2 minutes either side of 60 (times only move away from the boundary while the
    // test runs, so these cannot flake on a slow machine in the refused-to-ok direction).
    it('58 minutes before the start: ok', async () => {
      const f = await fixture(58, 118);
      expect((await mark(f.code)).result).toBe('ok');
    });

    it('62 minutes before the start: not_open_yet', async () => {
      const f = await fixture(62, 122);
      expect((await mark(f.code)).result).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });

    // The reason O7 existed in reverse: an organiser edits the event's dates (events.start_time/end_time) and
    // nothing moves the occurrence row. The event's dates decide.
    it('one occurrence: an event edited after creation follows its NEW dates, both ways', async () => {
      const early = await fixture(300, 360);
      await admin.from('events').update({ start_time: minutes(-30), end_time: minutes(30) }).eq('id', early.eventId);
      expect((await mark(early.code)).result).toBe('ok');

      const late = await fixture(-30, 30);
      await admin.from('events').update({ start_time: minutes(300), end_time: minutes(360) }).eq('id', late.eventId);
      expect((await mark(late.code)).result).toBe('not_open_yet');
      await expectNothingWritten(late.regId);
    });

    it('an event with no occurrence rows at all answers no_matching_occurrence, writes nothing', async () => {
      const f = await fixture(-30, 30);
      await sqlSuperuser(`delete from public.event_occurrences where event_id = '${f.eventId}'`);
      expect((await mark(f.code)).result).toBe('no_matching_occurrence');
      await expectNothingWritten(f.regId);
    });

    it('while the event is live: ok', async () => {
      const f = await fixture(-30, 30);
      expect((await mark(f.code)).result).toBe('ok');
      expect((await writes(f.regId)).checkins).toHaveLength(1);
    });

    it('after the end: closed, and nothing is written', async () => {
      const f = await fixture(-180, -1);
      expect((await mark(f.code)).result).toBe('closed');
      await expectNothingWritten(f.regId);
    });

    it('days after: closed, and nothing is written', async () => {
      const f = await fixture(-3 * 1440, -3 * 1440 + 120);
      expect((await mark(f.code)).result).toBe('closed');
      await expectNothingWritten(f.regId);
    });

    // Editing an event moves events.start_time/end_time and NOT its occurrence row (the only trigger is AFTER
    // INSERT), so for the one-occurrence event the event's dates must decide, not the occurrence's.
    it('one occurrence: the EVENT window decides, so an edited event whose occurrence row is stale still checks in on its real day', async () => {
      const f = await fixture(-30, 30);
      await sqlSuperuser(`update public.event_occurrences set starts_at = starts_at - interval '3 days', ends_at = ends_at - interval '3 days' where event_id = '${f.eventId}'`);
      expect((await mark(f.code)).result).toBe('ok');
      expect((await writes(f.regId)).checkins).toHaveLength(1);
    });

    it('one occurrence: an event moved away is refused even though its stale occurrence row still covers now', async () => {
      const f = await fixture(300, 360);
      await sqlSuperuser(`update public.event_occurrences set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where event_id = '${f.eventId}'`);
      expect((await mark(f.code)).result).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });

    it('one occurrence: an event that has ended is closed even though its stale occurrence row still covers now', async () => {
      const f = await fixture(-180, -10);
      await sqlSuperuser(`update public.event_occurrences set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where event_id = '${f.eventId}'`);
      expect((await mark(f.code)).result).toBe('closed');
      await expectNothingWritten(f.regId);
    });

    it('multi-occurrence: inside the second occurrence\'s pre-open checks in against that occurrence', async () => {
      const f = await fixture(-180, 90);
      const [, second] = await occurrences(f.eventId, [[-180, -120], [30, 90]]);
      expect((await mark(f.code)).result).toBe('ok');
      const w = await writes(f.regId);
      expect(w.checkins.map((c) => c.occurrence_id)).toEqual([second]);
    });

    it('multi-occurrence: in the gap before the next pre-open is not_open_yet', async () => {
      const f = await fixture(-180, 240);
      await occurrences(f.eventId, [[-180, -120], [180, 240]]);
      expect((await mark(f.code)).result).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });

    it('multi-occurrence: after the last occurrence is closed', async () => {
      const f = await fixture(-300, -120);
      await occurrences(f.eventId, [[-300, -240], [-180, -120]]);
      expect((await mark(f.code)).result).toBe('closed');
      await expectNothingWritten(f.regId);
    });

    it('multi-occurrence: where windows overlap, the occurrence already started wins over one only pre-opening, whatever the ordinals', async () => {
      const f = await fixture(-60, 120);
      // Ordinal 1 is the one still pre-opening, ordinal 2 the one that has started: ordering by ordinal alone
      // would pick the wrong one.
      const [, started] = await occurrences(f.eventId, [[30, 120], [-60, 10]]);
      expect((await mark(f.code)).result).toBe('ok');
      expect((await writes(f.regId)).checkins.map((c) => c.occurrence_id)).toEqual([started]);
    });
  });

  describe('self_check_in (attendee scans their own QR)', () => {
    it('before the pre-open: not_open_yet, and nothing is written', async () => {
      const f = await fixture(120, 180, { selfServe: true });
      expect(await selfCheckIn(f.code)).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });

    it('after the end: closed, and nothing is written', async () => {
      const f = await fixture(-180, -1, { selfServe: true });
      expect(await selfCheckIn(f.code)).toBe('closed');
      await expectNothingWritten(f.regId);
    });

    it('one occurrence: the EVENT window decides here too, so a stale occurrence row does not refuse a live event', async () => {
      const f = await fixture(-30, 30, { selfServe: true });
      await sqlSuperuser(`update public.event_occurrences set starts_at = starts_at - interval '3 days', ends_at = ends_at - interval '3 days' where event_id = '${f.eventId}'`);
      expect(await selfCheckIn(f.code)).toBe('ok');
      expect((await writes(f.regId)).checkins).toHaveLength(1);
    });

    it('multi-occurrence: the second occurrence\'s pre-open checks in against that occurrence (was no_matching_occurrence)', async () => {
      const f = await fixture(-180, 90, { selfServe: true });
      const [, second] = await occurrences(f.eventId, [[-180, -120], [30, 90]]);
      expect(await selfCheckIn(f.code)).toBe('ok');
      expect((await writes(f.regId)).checkins.map((c) => c.occurrence_id)).toEqual([second]);
    });

    it('multi-occurrence: in the gap is not_open_yet (was no_matching_occurrence)', async () => {
      const f = await fixture(-180, 240, { selfServe: true });
      await occurrences(f.eventId, [[-180, -120], [180, 240]]);
      expect(await selfCheckIn(f.code)).toBe('not_open_yet');
      await expectNothingWritten(f.regId);
    });
  });
});
