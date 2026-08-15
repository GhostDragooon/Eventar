// CPD Sprint 2 / Task 11 — mark_attended RLS + audit probes against the
// live dev project. Converts the staff-facing markAttended Server Action
// into an atomic, audited SECURITY DEFINER DB function. Owner-exclusive
// check-in (Q19 / 2026-06-02) is preserved — enforced in-function since the
// definer bypasses RLS entirely.
//
// Unlike self_check_in (anonymous, called via the admin/service-role
// client), mark_attended requires a real staff JWT: app_private.
// require_active_staff() resolves the caller via app_private.auth_email(),
// which reads the request.jwt.claims 'email' claim — only present on a
// real authenticated session, not the service-role client.
//
// All fixtures (events, registrations, staff, rate_limits rows) are
// disposable and cleaned up in afterEach/afterAll. Never touches the real
// live events/registrations/staff.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, createTestUser, deleteTestUser, sqlSuperuser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

function code(suffix: string): string {
  return `WK-${suffix}`;
}

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

describe.skipIf(!process.env.RLS_TESTS)('mark_attended RLS + audit', () => {
  let owner: TestUser;
  let nonOwner: TestUser;
  let plainUser: TestUser; // authenticated but NOT staff — for the gate-denial case
  let ownerStaffId: string;
  const eventIds: string[] = [];
  const registrationIds: string[] = [];
  const rateLimitKeys: string[] = [];
  const staffEmails: string[] = [];

  async function makeEventFixture(
    opts: { status?: 'draft' | 'published' | 'cancelled'; deleted?: boolean } = {},
  ): Promise<string> {
    const { status = 'published', deleted = false } = opts;
    const { data, error } = await admin
      .from('events')
      .insert({
        title: 'mark_attended RLS fixture — DELETE ME',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status,
        deleted_at: deleted ? new Date().toISOString() : null,
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (error) throw new Error(`event fixture: ${error.message}`);
    eventIds.push(data.id as string);
    // mark_attended always touches rate_limits for this event's key
    // internally (rate_limit_check upserts unconditionally) — track it here
    // at fixture-creation time so no test can forget to clean it up (Task
    // 10's review finding).
    rateLimitKeys.push(`markAttended:${data.id}`);
    return data.id as string;
  }

  async function makeRegistrationFixture(
    eventId: string,
    registrationCode: string,
    status: 'registered' | 'attended' | 'cancelled' = 'registered',
  ): Promise<string> {
    const { data, error } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `${registrationCode.toLowerCase()}@rls-test.invalid`,
        full_name: 'RLS Test Attendee',
        status,
        registration_code: registrationCode,
        ...(status === 'attended'
          ? { check_in_at: new Date().toISOString(), check_in_method: 'qr' }
          : {}),
      })
      .select('id')
      .single();
    if (error) throw new Error(`registration fixture: ${error.message}`);
    registrationIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    owner = await createTestUser('markattended-owner');
    nonOwner = await createTestUser('markattended-nonowner');
    plainUser = await createTestUser('markattended-plain');

    const { error } = await admin.from('staff').insert([
      {
        email: owner.email,
        role: 'organiser_member',
        full_name: 'RLS Test Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
      {
        email: nonOwner.email,
        role: 'organiser_member',
        full_name: 'RLS Test Non-Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
    ]);
    if (error) throw new Error(`staff fixture: ${error.message}`);
    staffEmails.push(owner.email, nonOwner.email);

    const { data: ownerStaff, error: ownerLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', owner.email)
      .single();
    if (ownerLookupErr || !ownerStaff) throw new Error(`owner staff lookup: ${ownerLookupErr?.message}`);
    ownerStaffId = ownerStaff.id as string;
  }, 60_000);

  afterEach(async () => {
    if (registrationIds.length > 0) {
      await mustDelete(admin.from('registrations').delete().in('id', registrationIds), 'registrations fixture');
      registrationIds.length = 0;
    }
    if (eventIds.length > 0) {
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
      eventIds.length = 0;
    }
    if (rateLimitKeys.length > 0) {
      await mustDelete(admin.from('rate_limits').delete().in('key', rateLimitKeys), 'rate_limits fixture');
      rateLimitKeys.length = 0;
    }
  }, 60_000);

  afterAll(async () => {
    // Belt-and-braces in case any single test's afterEach didn't run.
    if (registrationIds.length > 0) {
      await mustDelete(admin.from('registrations').delete().in('id', registrationIds), 'registrations fixture');
    }
    if (eventIds.length > 0) await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
    if (rateLimitKeys.length > 0) {
      await mustDelete(admin.from('rate_limits').delete().in('key', rateLimitKeys), 'rate_limits fixture');
    }
    if (staffEmails.length > 0) await mustDelete(admin.from('staff').delete().in('email', staffEmails), 'staff fixture');
    for (const u of [owner, nonOwner, plainUser]) if (u) await deleteTestUser(u);
  }, 60_000);

  // ---- 1. owner marks a valid code attended ----
  it('owner marks a valid code attended: ok, correct nested shape, audited', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA001');
    const regId = await makeRegistrationFixture(eventId, regCode);

    const { data, error } = await owner.client.rpc('mark_attended', {
      p_code: regCode,
      p_method: 'qr',
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('ok');
    expect(row.registration_id).toBe(regId);
    expect(row.full_name).toBe('RLS Test Attendee');
    expect(row.event_id).toBe(eventId);
    expect(row.event_title).toBe('mark_attended RLS fixture — DELETE ME');

    const { data: reg } = await admin
      .from('registrations')
      .select('status, check_in_at, check_in_method')
      .eq('id', regId)
      .single();
    expect(reg?.status).toBe('attended');
    expect(reg?.check_in_at).not.toBeNull();
    expect(reg?.check_in_method).toBe('qr');

    // C2: the write now goes through registration_checkins (ADR-0002), and
    // C1's sync trigger is what produced the legacy fields asserted above —
    // confirm the authoritative row exists and actually drove that sync.
    const { data: checkins } = await admin
      .from('registration_checkins')
      .select('occurrence_id, checked_in_at, check_in_method')
      .eq('registration_id', regId);
    expect(checkins).toHaveLength(1);
    expect(checkins?.[0].check_in_method).toBe('qr');
    expect(checkins?.[0].checked_in_at).toBe(reg?.check_in_at);

    const { data: auditRow } = await admin
      .from('audit_events')
      .select('event_type, actor_role, payload')
      .eq('event_type', 'attendee_checked_in')
      .eq('subject_id', regId)
      .maybeSingle();
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actor_role).toBe('organiser_member');
    expect((auditRow?.payload as { via?: string })?.via).toBe('staff_scan');
    expect((auditRow?.payload as { method?: string })?.method).toBe('qr');
    expect((auditRow?.payload as { event_id?: string })?.event_id).toBe(eventId);
  });

  // ---- 2. a different staff member (not the owner) gets info-hiding ----
  it('a different staff member attempting the owner\'s code sees not_recognised (info-hiding)', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA002');
    await makeRegistrationFixture(eventId, regCode);

    const { data, error } = await nonOwner.client.rpc('mark_attended', {
      p_code: regCode,
      p_method: 'manual',
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('not_recognised');
    expect(row.registration_id).toBeNull();

    // registration must remain untouched
    const { data: reg } = await admin
      .from('registrations')
      .select('status')
      .eq('registration_code', regCode)
      .single();
    expect(reg?.status).toBe('registered');
  });

  // ---- 3. re-marking an already-attended code (by the real owner) ----
  it('re-marking an already-attended code returns already with the real check_in_at', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA003');
    const regId = await makeRegistrationFixture(eventId, regCode);

    const first = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
    expect(first.error).toBeNull();
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    expect(firstRow.result).toBe('ok');

    const { data: reg } = await admin
      .from('registrations')
      .select('check_in_at')
      .eq('id', regId)
      .single();

    const second = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'manual' });
    expect(second.error).toBeNull();
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    expect(secondRow.result).toBe('already');
    expect(secondRow.check_in_at).toBe(reg?.check_in_at);

    // Race guard unaffected: the losing call must never have reached the
    // registration_checkins insert (the atomic UPDATE's WHERE status=
    // 'registered' already stopped it), so exactly one row exists.
    const { data: checkins } = await admin
      .from('registration_checkins')
      .select('id')
      .eq('registration_id', regId);
    expect(checkins).toHaveLength(1);
  });

  // ---- 3b. ambiguous multi-occurrence event (C2) ----
  it('a multi-occurrence event with no occurrence covering now() returns no_matching_occurrence and does not check in', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA003B');
    const regId = await makeRegistrationFixture(eventId, regCode);

    // C1's trigger auto-created exactly one occurrence spanning the whole
    // event (which covers now()). Replace it with two occurrences that
    // deliberately do NOT cover now(), simulating a multi-day event scanned
    // outside every day's window — no organiser UI creates multiple
    // occurrences yet, so this is a direct-SQL fixture per the task brief.
    // event_occurrences table-level REVOKEs service_role INSERT/DELETE
    // (Hard Rule 11 — its only writer is the events-insert trigger, C2 adds
    // no occurrence RPC), so the `admin` Supabase client can't do this;
    // sqlSuperuser bypasses PostgREST/grants entirely, local-only.
    await sqlSuperuser(`delete from public.event_occurrences where event_id = '${eventId}'`);
    await sqlSuperuser(`
      insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
      values
        ('${eventId}', 1, 'day', now() - interval '25 hours', now() - interval '24 hours'),
        ('${eventId}', 2, 'day', now() + interval '24 hours', now() + interval '25 hours')
    `);

    const { data, error } = await owner.client.rpc('mark_attended', {
      p_code: regCode,
      p_method: 'qr',
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('no_matching_occurrence');
    expect(row.registration_id).toBe(regId);

    // Must not guess: no checkin row. Status is untouched (not reverted —
    // 20260815040000 moved occurrence resolution ahead of any write, so
    // there is nothing to revert; the earlier "revert the flip" comment this
    // replaced described a mechanism that no longer exists).
    const { data: reg } = await admin
      .from('registrations')
      .select('status')
      .eq('id', regId)
      .single();
    expect(reg?.status).toBe('registered');
    const { data: checkins } = await admin
      .from('registration_checkins')
      .select('id')
      .eq('registration_id', regId);
    expect(checkins).toHaveLength(0);
  });

  // ---- 3c. genuine multi-occurrence check-in (20260815040000 fix) ----
  it('checking in on two different occurrences of the same registration succeeds both times — the bug this migration fixes', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA003C');
    const regId = await makeRegistrationFixture(eventId, regCode);

    await sqlSuperuser(`
      update public.event_occurrences
         set starts_at = now() - interval '5 minutes', ends_at = now() + interval '5 minutes'
       where event_id = '${eventId}' and ordinal = 1
    `);

    const first = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
    expect(first.error).toBeNull();
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    expect(firstRow.result).toBe('ok');

    await sqlSuperuser(`
      update public.event_occurrences
         set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '1 hour'
       where event_id = '${eventId}' and ordinal = 1
    `);
    await sqlSuperuser(`
      insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
      values ('${eventId}', 2, 'day', now() - interval '5 minutes', now() + interval '5 minutes')
    `);

    // Before the fix: 'already' immediately (status already 'attended' from
    // the first call), never reaching occurrence resolution — no second row.
    const second = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'manual' });
    expect(second.error).toBeNull();
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    expect(secondRow.result).toBe('ok');

    const { data: checkins } = await admin
      .from('registration_checkins')
      .select('occurrence_id, check_in_method')
      .eq('registration_id', regId)
      .order('checked_in_at');
    expect(checkins).toHaveLength(2);
    expect(checkins?.[0].check_in_method).toBe('qr');
    expect(checkins?.[1].check_in_method).toBe('manual');

    const third = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
    const thirdRow = Array.isArray(third.data) ? third.data[0] : third.data;
    expect(thirdRow.result).toBe('already');
  });

  // ---- 4. non-staff authenticated user is denied by the DB-level gate ----
  it('a non-staff authenticated user is denied by require_active_staff (42501)', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA004');
    await makeRegistrationFixture(eventId, regCode);

    const { error } = await plainUser.client.rpc('mark_attended', {
      p_code: regCode,
      p_method: 'qr',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // ---- 5. invalid p_method is rejected ----
  it('invalid p_method is rejected', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('MA005');
    await makeRegistrationFixture(eventId, regCode);

    const { error } = await owner.client.rpc('mark_attended', {
      p_code: regCode,
      p_method: 'carrier_pigeon',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/bad method/);
  });

  // ---- 6. audit chain stays valid after all the above ----
  it('verify_audit_chain reports zero broken links after fixture inserts', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
  // ---- lifecycle guards (2026-08-04 three-lens review, CRITICAL 2) ----
  //
  // DEFERRED 57 tightened self_check_in and left THIS door on the old
  // `status <> 'attended'` predicate. The two then disagreed about the same
  // person in the same second — and this is the door that mints CPD credit.
  // The review proved the full money path end to end on a cancelled
  // registration: mark_attended -> ok, award_attendance_credit -> issued, a
  // real credit_earned/attendance_verified row.
  //
  // HONESTY NOTE: these cases were written AFTER 20260804030000 had already
  // landed, so they were never watched failing here — the red evidence is the
  // review's live reproduction, not this file's history. Treat them as
  // regression cover, not as TDD-derived design.
  describe('lifecycle guards', () => {
    it('refuses a cancelled registration and leaves it cancelled', async () => {
      const eventId = await makeEventFixture();
      const regCode = code('MA200');
      await makeRegistrationFixture(eventId, regCode, 'cancelled');

      const { data, error } = await owner.client.rpc('mark_attended', {
        p_code: regCode,
        p_method: 'qr',
      });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('cancelled');

      const { data: reg } = await admin
        .from('registrations')
        .select('status')
        .eq('registration_code', regCode)
        .single();
      expect(reg?.status).toBe('cancelled');
    });

    it('refuses a soft-deleted event', async () => {
      const eventId = await makeEventFixture({ deleted: true });
      const regCode = code('MA201');
      await makeRegistrationFixture(eventId, regCode);

      const { data } = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('unavailable');
    });

    it('refuses an unpublished event', async () => {
      const eventId = await makeEventFixture({ status: 'draft' });
      const regCode = code('MA202');
      await makeRegistrationFixture(eventId, regCode);

      const { data } = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('unavailable');
    });

    it('still checks in a normal registration on a live published event', async () => {
      // The control. A guard suite that only asserts refusals passes happily
      // against an implementation that refuses everything.
      const eventId = await makeEventFixture();
      const regCode = code('MA203');
      await makeRegistrationFixture(eventId, regCode);

      const { data } = await owner.client.rpc('mark_attended', { p_code: regCode, p_method: 'qr' });
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('ok');
    });
  });
});
