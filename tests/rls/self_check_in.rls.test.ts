// CPD Sprint 2 / Task 10 — self_check_in RLS + audit probes against the
// live dev project. Converts the public selfCheckIn Server Action into an
// atomic, audited SECURITY DEFINER DB function (per-event rate limit
// instead of per-IP — see migration header + actions.ts comment).
//
// All fixtures (events, registrations, rate_limits rows) are disposable and
// cleaned up in afterAll/afterEach. Never touches the 4 real live events or
// 63 real registrations.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, sqlSuperuser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
// Valid-alphabet (2-9, A-Z minus 0/O/1/I/L) 6-char suffixes so codes pass
// isValidRegistrationCode's format check.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
// RFC 5737 TEST-NET-3 — reserved for documentation/testing, safe fake IPs.
const FAKE_IP = '203.0.113.10';
// Timestamped, not a fixed constant: staff.email is unique-indexed, so a row
// left behind by a crashed run would make this file's beforeAll fail on a
// duplicate key forever. Same pattern as checkin_throughput's fixture.
const STAFF_EMAIL = `selfcheckin-fixture-${Date.now()}@rls-test.invalid`;

function code(suffix: string): string {
  return `WK-${suffix}`;
}

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

describe.skipIf(!process.env.RLS_TESTS)('self_check_in RLS + audit', () => {
  let staffId: string;
  const eventIds: string[] = [];
  const registrationIds: string[] = [];
  const rateLimitKeys: string[] = [];

  // Defaults describe the ONE state in which self check-in is legitimate:
  // published, self-serve on, and now inside [start − CHECKIN_OPEN_MINUTES,
  // end]. Every lifecycle test below varies exactly one of them, so a failure
  // names the guard that let it through.
  //
  // selfServe defaults to TRUE here, which is NOT the column default
  // ({"staff": true, "self_serve": false}) — this file exists to exercise the
  // self-serve path, so an explicit opt-in is the honest fixture. Before the
  // DEFERRED-57 guards landed the value was irrelevant: the RPC never read it.
  type EventFixtureOpts = {
    startOffsetMs?: number;
    endOffsetMs?: number;
    status?: 'draft' | 'published' | 'cancelled';
    selfServe?: boolean;
  };

  async function makeEventFixture(opts: EventFixtureOpts = {}): Promise<string> {
    const {
      startOffsetMs = 0,
      endOffsetMs = 3_600_000,
      status = 'published',
      selfServe = true,
    } = opts;
    const { data, error } = await admin
      .from('events')
      .insert({
        title: 'self-check-in RLS fixture — DELETE ME',
        start_time: new Date(Date.now() + startOffsetMs).toISOString(),
        end_time: new Date(Date.now() + endOffsetMs).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status,
        checkin_modes: { staff: true, self_serve: selfServe },
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (error) throw new Error(`event fixture: ${error.message}`);
    eventIds.push(data.id as string);
    // self_check_in always touches rate_limits for this event's key
    // internally (rate_limit_check upserts unconditionally), regardless of
    // which test calls it — track it here so no test can forget to clean
    // it up, rather than relying on each call site to push it manually.
    rateLimitKeys.push(`selfCheckIn:${data.id}`);
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
    // Dedicated staff fixture, purely as a valid FK target for
    // events.created_by. Previously this borrowed an arbitrary shared staff
    // row (`.limit(1).single()`), which raced against other RLS files'
    // staff-fixture insert/delete under the full concurrent `pnpm test:rls`
    // suite — this file owns its own row instead.
    const { data, error } = await admin
      .from('staff')
      .insert({
        email: STAFF_EMAIL,
        role: 'organiser_member',
        full_name: 'RLS Test Staff (self_check_in fixture)',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`staff fixture: ${error?.message}`);
    staffId = data.id as string;
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
    await mustDelete(admin.from('staff').delete().eq('email', STAFF_EMAIL), 'staff fixture');
  }, 60_000);

  // ---- 1. valid, not-yet-attended code succeeds ----
  it('valid code succeeds: row becomes attended, event_id matches', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('SCI001');
    const regId = await makeRegistrationFixture(eventId, regCode);

    const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('ok');
    expect(row.event_id).toBe(eventId);

    const { data: reg } = await admin
      .from('registrations')
      .select('status, check_in_at, check_in_method')
      .eq('registration_code', regCode)
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
  });

  // ---- 2. re-tap the same code ----
  it('re-tapping the same code returns already', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('SCI002');
    const regId = await makeRegistrationFixture(eventId, regCode);

    const first = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    expect(firstRow.result).toBe('ok');

    const second = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    expect(second.error).toBeNull();
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    expect(secondRow.result).toBe('already');
    expect(secondRow.event_id).toBe(eventId);

    // Race guard unaffected: the losing call must never have reached the
    // registration_checkins insert (the atomic UPDATE's WHERE status=
    // 'registered' already stopped it), so exactly one row exists.
    const { data: checkins } = await admin
      .from('registration_checkins')
      .select('id')
      .eq('registration_id', regId);
    expect(checkins).toHaveLength(1);
  });

  // ---- 2b. ambiguous multi-occurrence event (C2) ----
  it('a multi-occurrence event with no occurrence covering now() returns no_matching_occurrence and does not check in', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('SCI002B');
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

    const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('no_matching_occurrence');
    expect(row.event_id).toBe(eventId);

    // Must not guess: no checkin row, and the status flip is reverted rather
    // than left stranded 'attended' with nothing to back it (see migration
    // header — this revert is a deliberate addition beyond a bare refusal).
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

  // ---- 3. unknown/nonexistent code ----
  it('unknown code returns invalid', async () => {
    const guessIp = '203.0.113.30';
    rateLimitKeys.push(`selfCheckInGuess:${guessIp}`);
    const { data, error } = await admin.rpc('self_check_in', { p_code: code('NOPE99'), p_ip: guessIp });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('invalid');
    expect(row.event_id).toBeNull();
  });

  // ---- 3b. guessing-path rate limit (Task 14 exit-gate fix) ----
  it('rate_limited when the same IP guesses invalid codes past the cap', async () => {
    const guessIp = '203.0.113.31';
    rateLimitKeys.push(`selfCheckInGuess:${guessIp}`);
    const nowMs = Date.now();
    const winStartIso = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();

    // Seed the guess-limit counter directly at cap (avoids 10 real round trips).
    const { error: seedError } = await admin
      .from('rate_limits')
      .upsert({ key: `selfCheckInGuess:${guessIp}`, count: 10, window_start: winStartIso });
    expect(seedError).toBeNull();

    const { data, error } = await admin.rpc('self_check_in', {
      p_code: code('NOPE98'), p_ip: guessIp,
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    // The guessing path returns 'rate_limited', not 'invalid', once capped —
    // this is the regression fix itself: before it, an invalid code always
    // returned 'invalid' with no limit at all, regardless of how many times
    // the same IP had already guessed.
    expect(row.result).toBe('rate_limited');
    expect(row.event_id).toBeNull();
  });

  // ---- 3c. a resolvable code from the SAME IP is unaffected by the guess cap ----
  it('a legitimate attendee is not throttled by another guesser sharing their IP', async () => {
    const guessIp = '203.0.113.32';
    rateLimitKeys.push(`selfCheckInGuess:${guessIp}`);
    const nowMs = Date.now();
    const winStartIso = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
    await admin
      .from('rate_limits')
      .upsert({ key: `selfCheckInGuess:${guessIp}`, count: 10, window_start: winStartIso });

    const eventId = await makeEventFixture();
    const regCode = code('SCI003');
    await makeRegistrationFixture(eventId, regCode);

    // Same IP as the capped guesser above, but this code IS valid — the
    // guess-limit only gates the invalid-code branch, so this must succeed.
    const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: guessIp });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('ok');
  });

  // ---- 4. several distinct registrations for one event, low volume ----
  it('multiple distinct registrations for one event all succeed under the shared per-event counter', async () => {
    const eventId = await makeEventFixture();
    const codes = Array.from({ length: 8 }, (_, i) => code(`M${ALPHABET[i]}${ALPHABET[i]}${ALPHABET[i]}${ALPHABET[i]}${ALPHABET[i]}`));
    for (const c of codes) {
      await makeRegistrationFixture(eventId, c);
    }

    for (const c of codes) {
      const { data, error } = await admin.rpc('self_check_in', { p_code: c, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('ok');
      expect(row.event_id).toBe(eventId);
    }

    const { data: attended } = await admin
      .from('registrations')
      .select('registration_code, status')
      .eq('event_id', eventId);
    expect(attended?.every((r) => r.status === 'attended')).toBe(true);
    expect(attended).toHaveLength(8);
  }, 30_000);

  // ---- 5. rate-limited branch, seeded directly (no 600 real calls) ----
  it('rate_limited when the per-event counter is already at cap', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('SCI005');
    await makeRegistrationFixture(eventId, regCode);

    const key = `selfCheckIn:${eventId}`; // already tracked by makeEventFixture
    // Mirror the function's window-alignment: floor(epoch/60)*60, as ISO.
    // Known narrow race: this window is computed client-side; the function
    // computes its own window server-side moments later. If the gap between
    // this seed and the RPC call below straddles a minute boundary, the
    // function's rate_limit_check would reset the counter instead of reading
    // the seeded 600, and this test would flake. Not observed in practice —
    // accepted as a documented limitation rather than restructured into one
    // transaction for a sub-second race.
    const nowMs = Date.now();
    const winStartMs = Math.floor(nowMs / 60_000) * 60_000;
    const winStartIso = new Date(winStartMs).toISOString();

    const { error: seedError } = await admin
      .from('rate_limits')
      .upsert({ key, count: 600, window_start: winStartIso });
    expect(seedError).toBeNull();

    const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.result).toBe('rate_limited');
    expect(row.event_id).toBe(eventId);

    // Confirm the registration was NOT checked in (rate limit blocks before
    // the idempotent UPDATE).
    const { data: reg } = await admin
      .from('registrations')
      .select('status')
      .eq('registration_code', regCode)
      .single();
    expect(reg?.status).toBe('registered');
  });

  // ---- 6. lifecycle guards (DEFERRED item 57) ----
  //
  // Until 2026-08-04 self_check_in's ONLY predicate was `status <> 'attended'`:
  // no time window, no checkin_modes.self_serve check, no publication check,
  // and a cancelled registration was flipped to attended. The ±24h bound in
  // award_attendance_credit was compensating for all of it at one remove —
  // attendance itself was minted by mere possession of an emailed code, at any
  // time, on any event, in any state.
  //
  // Each test asserts a SPECIFIC result code, not merely "not ok": the whole
  // point is that the attendee at the door is told the real reason.
  describe('lifecycle guards', () => {
    it('refuses before the check-in window opens (not_open_yet)', async () => {
      // Starts in 3h; the window opens at start − 60 min, so now is outside it.
      const eventId = await makeEventFixture({
        startOffsetMs: 3 * 3_600_000,
        endOffsetMs: 4 * 3_600_000,
      });
      const regCode = code('SCI100');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('not_open_yet');

      const { data: reg } = await admin
        .from('registrations')
        .select('status')
        .eq('registration_code', regCode)
        .single();
      expect(reg?.status).toBe('registered');
    });

    it('accepts inside the pre-start window (start − 60 min)', async () => {
      // Starts in 30 min: before start, but inside the check-in window. This
      // is the case that must NOT regress — the reminder email carrying the QR
      // goes out exactly here.
      const eventId = await makeEventFixture({
        startOffsetMs: 30 * 60_000,
        endOffsetMs: 90 * 60_000,
      });
      const regCode = code('SCI101');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('ok');
    });

    // Split from not_open_yet deliberately: "wait, it opens in an hour" is a
    // FALSE instruction for someone who arrived after the event ended, and
    // nothing would ever correct them.
    it('refuses after the event has ended (closed, not not_open_yet)', async () => {
      const eventId = await makeEventFixture({
        startOffsetMs: -3 * 3_600_000,
        endOffsetMs: -2 * 3_600_000,
      });
      const regCode = code('SCI102');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('closed');
    });

    it('refuses when the event is not published', async () => {
      const eventId = await makeEventFixture({ status: 'draft' });
      const regCode = code('SCI103');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('unavailable');
    });

    it('refuses when the event is cancelled', async () => {
      const eventId = await makeEventFixture({ status: 'cancelled' });
      const regCode = code('SCI104');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('unavailable');
    });

    it('refuses when self-serve check-in is off for the event', async () => {
      // The pass page already hides the "Confirm I'm here" button on this
      // event, but the Server Action could be POSTed directly — the UI was the
      // only thing enforcing it.
      const eventId = await makeEventFixture({ selfServe: false });
      const regCode = code('SCI105');
      await makeRegistrationFixture(eventId, regCode);

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('self_serve_off');
    });

    it('refuses a cancelled registration and leaves it cancelled', async () => {
      const eventId = await makeEventFixture();
      const regCode = code('SCI106');
      const regId = await makeRegistrationFixture(eventId, regCode);
      const { error: cancelErr } = await admin
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', regId);
      expect(cancelErr).toBeNull();

      const { data, error } = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row.result).toBe('cancelled');

      // The old predicate was `status <> 'attended'`, which happily flipped a
      // cancelled registration to attended.
      const { data: reg } = await admin
        .from('registrations')
        .select('status')
        .eq('registration_code', regCode)
        .single();
      expect(reg?.status).toBe('cancelled');
    });
  });

  // ---- 7. audit chain stays valid after all the above ----
  it('verify_audit_chain reports zero broken links after fixture inserts', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
});
