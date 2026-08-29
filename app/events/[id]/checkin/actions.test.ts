// Runtime Contract invariant 1 — "a credit failure must NEVER change the
// attendance outcome" — had no regression guard until this file. The whole CPD
// issuance build is arranged around that invariant, and it was held up by two
// hand-written try/catch blocks with nothing asserting them.
//
// That gap already let a real defect through: `supabaseAdmin()` was constructed
// OUTSIDE the try. It reads process.env with non-null assertions, so on a
// misconfigured deploy (missing SUPABASE_SERVICE_ROLE_KEY) it throws — AFTER
// mark_attended has already committed. The staff member would see a generic
// error for a check-in that actually succeeded, and a rescan would say "Already
// attended." That is the response inversion the invariant forbids.
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => ({
    id: 'staff-1',
    email: 'operator@example.test',
    role: 'organiser_admin',
    full_name: 'Test Operator',
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const EVENT_ID = '11111111-2222-4333-8444-555555555555';
let checkinResult = 'ok';
const markAttendedRow = {
  get result() {
    return checkinResult;
  },
  event_id: EVENT_ID,
  registration_id: 'reg-1',
  full_name: 'Test Attendee',
  event_title: 'Test Event',
};

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    rpc: async () => ({ data: [markAttendedRow], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user-1' } } }) },
  })),
}));

// The failure modes we need to simulate live here: a throwing client factory
// (the real I1 bug) and a rejecting award call.
let adminThrows = false;
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => {
    if (adminThrows) throw new Error('supabaseUrl is required');
    return {};
  },
}));

let awardRejects = false;
let awardOutcomes: Array<{ bodyId: string | null; status: string; reason?: string }> = [
  { bodyId: 'body-1', status: 'issued' },
];
const awardMock = vi.fn(async () => {
  if (awardRejects) throw new Error('credit issuance exploded');
  return awardOutcomes;
});
vi.mock('@/lib/cpd/awardAttendanceCredit', () => ({
  awardAttendanceCredit: (...args: unknown[]) => awardMock(...(args as [])),
}));

import { markAttended } from './actions';

const SUCCESS_BASE = {
  ok: true as const,
  registration: {
    id: 'reg-1',
    full_name: 'Test Attendee',
    event_id: EVENT_ID,
    event_title: 'Test Event',
  },
};

describe('markAttended — attendance stays authoritative when credit fails', () => {
  beforeEach(() => {
    adminThrows = false;
    awardRejects = false;
    checkinResult = 'ok';
    awardOutcomes = [{ bodyId: 'body-1', status: 'issued' }];
    awardMock.mockClear();
  });

  it('returns the attendance success payload when the credit is issued', async () => {
    const res = await markAttended('WK-ABC234', 'qr');
    expect(res).toMatchObject(SUCCESS_BASE);
    if (!('ok' in res) || !res.ok) throw new Error('expected ok');
    expect(res.credit?.anyIssued).toBe(true);
    expect(res.credit?.lines).toContain('CPD credit issued');
    expect(awardMock).toHaveBeenCalledTimes(1);
  });

  it('returns the SAME attendance payload when the award call rejects', async () => {
    awardRejects = true;
    const res = await markAttended('WK-ABC234', 'qr');
    expect(res).toMatchObject(SUCCESS_BASE);
    if (!('ok' in res) || !res.ok) throw new Error('expected ok');
    // Credit summary reports the failure; attendance branch is still ok.
    expect(res.credit?.allSkipped).toBe(true);
    expect(res.credit?.lines.some((l) => l.includes('reconcile'))).toBe(true);
  });

  it('returns the SAME attendance payload when the admin client itself throws (the I1 regression)', async () => {
    adminThrows = true;
    // Pre-fix this rejected, inverting the response for an already-committed
    // check-in. The award is never reached, so nothing should have been called.
    const res = await markAttended('WK-ABC234', 'qr');
    expect(res).toMatchObject(SUCCESS_BASE);
    expect(awardMock).not.toHaveBeenCalled();
  });

  it('surfaces no_licence as an explicit credit line without failing attendance', async () => {
    awardOutcomes = [{ bodyId: 'body-1', status: 'skipped', reason: 'no_licence' }];
    const res = await markAttended('WK-ABC234', 'qr');
    expect(res).toMatchObject(SUCCESS_BASE);
    if (!('ok' in res) || !res.ok) throw new Error('expected ok');
    expect(res.credit?.allSkipped).toBe(true);
    // Copy tightened 2026-08-29 (Stage B4 broadened F4 to accept declared
    // OR verified — the old "no verified licence" line was inaccurate).
    expect(res.credit?.lines.some((l) => l.includes('no licence for this body'))).toBe(true);
  });

  it('gives no_matching_occurrence its own message, distinct from the generic default', async () => {
    checkinResult = 'no_matching_occurrence';
    const res = await markAttended('WK-ABC234', 'qr');
    expect(res).toEqual({ error: 'No matching session for this check-in time — check the event schedule.' });
    expect(res).not.toEqual({ error: 'Code not recognised.' });
    expect(awardMock).not.toHaveBeenCalled();
  });

  it('passes the staff auth user id as actorId, not the staff row id', async () => {
    await markAttended('WK-ABC234', 'qr');
    // credit_ledger.actor_id references public.users(id); staff.id is an
    // unrelated uuid, so passing it would raise 23503 and cost the credit.
    expect(awardMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'auth-user-1' }),
    );
  });
});
