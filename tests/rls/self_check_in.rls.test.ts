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
import { admin } from '../helpers/clients';
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

  async function makeEventFixture(): Promise<string> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title: 'self-check-in RLS fixture — DELETE ME',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
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
    await makeRegistrationFixture(eventId, regCode);

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
  });

  // ---- 2. re-tap the same code ----
  it('re-tapping the same code returns already', async () => {
    const eventId = await makeEventFixture();
    const regCode = code('SCI002');
    await makeRegistrationFixture(eventId, regCode);

    const first = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    expect(firstRow.result).toBe('ok');

    const second = await admin.rpc('self_check_in', { p_code: regCode, p_ip: FAKE_IP });
    expect(second.error).toBeNull();
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    expect(secondRow.result).toBe('already');
    expect(secondRow.event_id).toBe(eventId);
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

  // ---- 6. audit chain stays valid after all the above ----
  it('verify_audit_chain reports zero broken links after fixture inserts', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
});
