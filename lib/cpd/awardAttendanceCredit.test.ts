import { describe, it, expect, vi, afterEach } from 'vitest';
// awardAttendanceCredit.ts uses `import 'server-only'` which throws in the test
// context — same neutralisation as auth.test.ts / rateLimit.test.ts.
vi.mock('server-only', () => ({}));
import type { SupabaseClient } from '@supabase/supabase-js';
import { awardAttendanceCredit } from './awardAttendanceCredit';

// Fake admin client whose single rpc() returns a fixed { data, error }.
function fakeAdmin(result: { data?: unknown; error?: { code?: string } | null }): {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const ARGS = { eventId: 'evt-1', registrationCode: 'WK-SECRET' };

describe('awardAttendanceCredit — thin wrapper', () => {
  const orig = process.env.CPD_ISSUANCE_ENABLED;
  afterEach(() => {
    process.env.CPD_ISSUANCE_ENABLED = orig;
    vi.restoreAllMocks();
  });

  it("kill switch explicitly 'false' → skipped:disabled, never calls the RPC", async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'false';
    const { client, rpc } = fakeAdmin({ data: 'issued', error: null });
    expect(await awardAttendanceCredit(client, ARGS)).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(rpc).not.toHaveBeenCalled();
  });

  // Fail-OPEN regression: found running this live against the local/demo stack,
  // which has no CPD_ISSUANCE_ENABLED set anywhere — a "kill switch" that
  // defaults off means the feature never runs until someone discovers an
  // undocumented env var. Unset MUST behave like 'true', not like 'false'.
  it('kill switch unset (undefined) → issuance proceeds, RPC IS called', async () => {
    delete process.env.CPD_ISSUANCE_ENABLED;
    const { client, rpc } = fakeAdmin({ data: 'issued', error: null });
    expect(await awardAttendanceCredit(client, ARGS)).toEqual({ status: 'issued' });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('maps the definer status strings', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    expect(await awardAttendanceCredit(fakeAdmin({ data: 'issued', error: null }).client, ARGS)).toEqual({ status: 'issued' });
    expect(await awardAttendanceCredit(fakeAdmin({ data: 'already', error: null }).client, ARGS)).toEqual({ status: 'already' });
    expect(await awardAttendanceCredit(fakeAdmin({ data: 'skipped:no_licence', error: null }).client, ARGS)).toEqual({ status: 'skipped', reason: 'no_licence' });
  });

  it('maps a technical error to failed (not skipped)', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    expect(await awardAttendanceCredit(fakeAdmin({ data: null, error: { code: '42883' } }).client, ARGS)).toEqual({ status: 'failed', reason: '42883' });
  });

  it('never logs the registration_code (capability token)', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await awardAttendanceCredit(fakeAdmin({ data: 'issued', error: null }).client, ARGS);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('WK-SECRET');
  });
});
