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
const markAttendedRow = {
  result: 'ok',
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
const awardMock = vi.fn(async () => {
  if (awardRejects) throw new Error('credit issuance exploded');
  return { status: 'issued' as const };
});
vi.mock('@/lib/cpd/awardAttendanceCredit', () => ({
  awardAttendanceCredit: (...args: unknown[]) => awardMock(...(args as [])),
}));

import { markAttended } from './actions';

const SUCCESS = {
  ok: true,
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
    awardMock.mockClear();
  });

  it('returns the attendance success payload when the credit is issued', async () => {
    await expect(markAttended('WK-ABC234', 'qr')).resolves.toEqual(SUCCESS);
    expect(awardMock).toHaveBeenCalledTimes(1);
  });

  it('returns the SAME payload when the award call rejects', async () => {
    awardRejects = true;
    await expect(markAttended('WK-ABC234', 'qr')).resolves.toEqual(SUCCESS);
  });

  it('returns the SAME payload when the admin client itself throws (the I1 regression)', async () => {
    adminThrows = true;
    // Pre-fix this rejected, inverting the response for an already-committed
    // check-in. The award is never reached, so nothing should have been called.
    await expect(markAttended('WK-ABC234', 'qr')).resolves.toEqual(SUCCESS);
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
