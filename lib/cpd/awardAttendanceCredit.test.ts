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
    const { client, rpc } = fakeAdmin({ data: [{ body_id: 'body-1', outcome: 'issued' }], error: null });
    expect(await awardAttendanceCredit(client, ARGS)).toEqual([{ bodyId: null, status: 'skipped', reason: 'disabled' }]);
    expect(rpc).not.toHaveBeenCalled();
  });

  // Fail-OPEN regression: found running this live against the local/demo stack,
  // which has no CPD_ISSUANCE_ENABLED set anywhere — a "kill switch" that
  // defaults off means the feature never runs until someone discovers an
  // undocumented env var. Unset MUST behave like 'true', not like 'false'.
  it('kill switch unset (undefined) → issuance proceeds, RPC IS called', async () => {
    delete process.env.CPD_ISSUANCE_ENABLED;
    const { client, rpc } = fakeAdmin({ data: [{ body_id: 'body-1', outcome: 'issued' }], error: null });
    expect(await awardAttendanceCredit(client, ARGS)).toEqual([{ bodyId: 'body-1', status: 'issued' }]);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('maps the definer status strings, one outcome per body', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    expect(
      await awardAttendanceCredit(fakeAdmin({ data: [{ body_id: 'body-1', outcome: 'issued' }], error: null }).client, ARGS),
    ).toEqual([{ bodyId: 'body-1', status: 'issued' }]);
    expect(
      await awardAttendanceCredit(fakeAdmin({ data: [{ body_id: 'body-1', outcome: 'already' }], error: null }).client, ARGS),
    ).toEqual([{ bodyId: 'body-1', status: 'already' }]);
    // Multi-body call — several bodies accredit one event, one outcome each.
    expect(
      await awardAttendanceCredit(
        fakeAdmin({
          data: [
            { body_id: 'body-1', outcome: 'issued' },
            { body_id: 'body-2', outcome: 'skipped:no_licence' },
          ],
          error: null,
        }).client,
        ARGS,
      ),
    ).toEqual([
      { bodyId: 'body-1', status: 'issued' },
      { bodyId: 'body-2', status: 'skipped', reason: 'no_licence' },
    ]);
    // Zero-groups case — the single-outcome equivalent of the old scalar
    // 'skipped:not_cpd', body_id null (nothing was ever evaluated).
    expect(
      await awardAttendanceCredit(fakeAdmin({ data: [{ body_id: null, outcome: 'skipped:not_cpd' }], error: null }).client, ARGS),
    ).toEqual([{ bodyId: null, status: 'skipped', reason: 'not_cpd' }]);
  });

  it('maps a technical error to a single failed outcome (not skipped)', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    expect(await awardAttendanceCredit(fakeAdmin({ data: null, error: { code: '42883' } }).client, ARGS)).toEqual([
      { bodyId: null, status: 'failed', reason: '42883' },
    ]);
  });

  it('never logs the registration_code (capability token)', async () => {
    process.env.CPD_ISSUANCE_ENABLED = 'true';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await awardAttendanceCredit(fakeAdmin({ data: [{ body_id: 'body-1', outcome: 'issued' }], error: null }).client, ARGS);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('WK-SECRET');
  });
});
