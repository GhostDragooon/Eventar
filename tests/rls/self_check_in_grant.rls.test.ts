// Security review 2026-08-06 — MEDIUM: self_check_in reachable via PostgREST
// with a caller-supplied p_ip.
//
// self_check_in(p_code, p_ip) is SECURITY DEFINER and was granted EXECUTE to
// anon + authenticated, so /rest/v1/rpc/self_check_in was a parallel door to
// the Server Action. Its only brute-force guard is a rate-limit keyed on p_ip
// — a caller argument — so an attacker rotating p_ip defeated the guessing cap
// entirely (proven live: 12 rotated-IP guesses, none limited; 12 fixed-IP, tripped
// at 11). The sole legitimate caller (app/(public)/checkin/confirm/actions.ts)
// uses the service_role admin client, which keeps EXECUTE. Closed by
// 20260806000100_self_check_in_service_role_only.sql.
//
// Gated on RLS_TESTS.
import { describe, it, expect, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const FAKE_IP = '203.0.113.11'; // RFC 5737 TEST-NET-3

describe.skipIf(!process.env.RLS_TESTS)('self_check_in — service-role only', () => {
  const anon = createAnonClient();
  let authed: TestUser | null = null;

  afterAll(async () => {
    if (authed) await deleteTestUser(authed);
    // The RED run (pre-fix) lets anon reach the guessing path, which upserts a
    // rate_limits row keyed on the fake IP. Clean it up regardless of outcome.
    await admin.from('rate_limits').delete().eq('key', `selfCheckInGuess:${FAKE_IP}`);
  });

  it('DENIES the anon role EXECUTE via rpc', async () => {
    const { error } = await anon.rpc('self_check_in', { p_code: 'WK-ZZZZZZ', p_ip: FAKE_IP });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501'); // permission denied for function
  });

  it('DENIES an authenticated (signed-in) user EXECUTE via rpc', async () => {
    authed = await createTestUser(`selfcheckin-grant-${Date.now()}`);
    const { error } = await authed.client.rpc('self_check_in', { p_code: 'WK-ZZZZZZ', p_ip: FAKE_IP });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('STILL ALLOWS the service_role client (the Server Action path)', async () => {
    const { data, error } = await admin.rpc('self_check_in', { p_code: 'WK-ZZZZZZ', p_ip: FAKE_IP });
    expect(error).toBeNull();
    // Bogus code → 'invalid'. Proves the definer still runs for service_role.
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.result).toBe('invalid');
  });
});
