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
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

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

  async function makeEventFixture(): Promise<string> {
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
        status: 'published',
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
    status: 'registered' | 'attended' = 'registered',
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
      await admin.from('registrations').delete().in('id', registrationIds);
      registrationIds.length = 0;
    }
    if (eventIds.length > 0) {
      await admin.from('events').delete().in('id', eventIds);
      eventIds.length = 0;
    }
    if (rateLimitKeys.length > 0) {
      await admin.from('rate_limits').delete().in('key', rateLimitKeys);
      rateLimitKeys.length = 0;
    }
  }, 60_000);

  afterAll(async () => {
    // Belt-and-braces in case any single test's afterEach didn't run.
    if (registrationIds.length > 0) await admin.from('registrations').delete().in('id', registrationIds);
    if (eventIds.length > 0) await admin.from('events').delete().in('id', eventIds);
    if (rateLimitKeys.length > 0) await admin.from('rate_limits').delete().in('key', rateLimitKeys);
    if (staffEmails.length > 0) await admin.from('staff').delete().in('email', staffEmails);
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
});
