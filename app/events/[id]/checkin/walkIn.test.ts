import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockRequireStaff = vi.fn();
const { MockNotAuthorizedError } = vi.hoisted(() => ({
  MockNotAuthorizedError: class NotAuthorizedError extends Error {},
}));
vi.mock('@/lib/auth', () => ({
  NotAuthorizedError: MockNotAuthorizedError,
  requireStaff: (...args: unknown[]) => mockRequireStaff(...args),
  canCheckIn: (role: string) => ['organiser_admin', 'organiser_member', 'eventar_staff'].includes(role),
  canManageEvent: (event: { organisation_id: string | null }, staff: { role: string; organisation_id?: string }) => {
    if (staff.role === 'eventar_staff') return true;
    return event.organisation_id != null && event.organisation_id === staff.organisation_id;
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRateLimitBySession = vi.fn().mockResolvedValue({ allowed: true });
vi.mock('@/lib/rateLimit', () => ({
  rateLimitBySession: (...args: unknown[]) => mockRateLimitBySession(...args),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('@/lib/registrationCode', () => ({
  isValidRegistrationCode: () => true,
  generateRegistrationCode: () => 'WK-TEST1',
}));

const markAttendedResult = {
  ok: true as const,
  registration: { id: 'reg-1', full_name: 'Walk In', event_id: 'evt-1', event_title: 'Test' },
  credit: { anyIssued: false, allSkipped: false, lines: [] },
};

// What mark_attended answers for the check-in that follows the walk-in's registration.
let markAttendedStatus = 'ok';
let markAttendedRpcError: { code: string; message: string } | null = null;
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    rpc: async () => ({ data: [{ result: markAttendedStatus, ...markAttendedResult.registration }], error: markAttendedRpcError }),
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
  })),
}));

vi.mock('@/lib/cpd/awardAttendanceCredit', () => ({
  awardAttendanceCredit: async () => [],
}));

import { walkInRegisterAndCheckIn } from './actions';

const ORG_ID = 'org-1';
const EVENT_ID = '11111111-2222-4333-8444-555555555555';
const staff = { id: 'staff-1', email: 'op@test.org', role: 'organiser_admin', full_name: 'Op', organisation_id: ORG_ID };

const validInput = { eventId: EVENT_ID, fullName: 'Walk In', email: 'walk@in.test' };

// computeLifecycle() needs real start/end times — started 30m ago, ends in
// 30m, comfortably inside the 'live' window (checkin opens 60m pre-start).
const NOW = Date.now();
const LIVE_TIMES = {
  start_time: new Date(NOW - 30 * 60_000).toISOString(),
  end_time: new Date(NOW + 30 * 60_000).toISOString(),
  registration_close_at: null,
  registration_open_at: null,
};
const ENDED_TIMES = {
  start_time: new Date(NOW - 3 * 60 * 60_000).toISOString(),
  end_time: new Date(NOW - 60 * 60_000).toISOString(),
  registration_close_at: null,
  registration_open_at: null,
};
// No registration_close_at/open_at set, so this resolves to 'registering'
// (computeLifecycle's default fallthrough), not 'upcoming' — either way it's
// not 'live', which is all this gate distinguishes.
const NOT_YET_OPEN_TIMES = {
  start_time: new Date(NOW + 3 * 60 * 60_000).toISOString(),
  end_time: new Date(NOW + 4 * 60 * 60_000).toISOString(),
  registration_close_at: null,
  registration_open_at: null,
};

function mockEventSelect(event: Record<string, unknown> | null, error: unknown = null) {
  mockFrom.mockReturnValueOnce({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: event, error }) }) }),
  });
}

function mockCapacityCount(count: number) {
  mockFrom.mockReturnValueOnce({
    select: () => ({ eq: () => Promise.resolve({ count }) }),
  });
}

function mockRegInsert(data: unknown, error: unknown = null) {
  mockFrom.mockReturnValueOnce({
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data, error }) }) }),
  });
}

function mockEmailLogInsert() {
  mockFrom.mockReturnValueOnce({
    insert: () => Promise.resolve({ error: null }),
  });
}

beforeEach(() => {
  markAttendedStatus = 'ok';
  markAttendedRpcError = null;
  mockRequireStaff.mockReset().mockResolvedValue(staff);
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockRateLimitBySession.mockReset().mockResolvedValue({ allowed: true });
});

describe('walkInRegisterAndCheckIn', () => {
  // Rule 12 (DB-02 dev review F3): the person is registered BEFORE mark_attended can refuse. A refusal after the
  // insert must say the registration exists (and its code), not read as "nothing happened": a retry otherwise
  // answers "already registered" and code entry refuses too.
  it('a check-in refused after the registration says the person was registered, with the code and the reason', async () => {
    markAttendedStatus = 'not_open_yet';
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    const res = await walkInRegisterAndCheckIn(validInput);
    // The event window is open (the gate passed), so mark_attended's per-session refusal means no session is open: the
    // single-event sentence ("opens 60 minutes before the event starts") would be false here (backtest m1).
    expect(res).toEqual({
      error: 'Walk In was registered (code WK-TEST1) but not checked in. No session is open for check-in right now. When one opens, use Enter code with WK-TEST1 to finish.',
    });
  });

  it('every session over while the event window is still open: same true sentence, not "This event has ended."', async () => {
    markAttendedStatus = 'closed';
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({
      error: 'Walk In was registered (code WK-TEST1) but not checked in. No session is open for check-in right now. When one opens, use Enter code with WK-TEST1 to finish.',
    });
  });

  // Backtest MINOR: a deadlock with an email edit used to throw after the row existed. "Try again" would hit
  // "already registered", so the walk-in's recovery is the code.
  it.each(['40P01', '40001'])('a %s collision after the registration says so and gives the code to finish with', async (code) => {
    markAttendedRpcError = { code, message: 'deadlock detected' };
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({
      error: 'Walk In was registered (code WK-TEST1) but not checked in. That check-in collided with another change. Use Enter code with WK-TEST1 to finish.',
    });
  });

  // RV-FINAL F2: body_admin passed canManageEvent, the registration was inserted, then mark_attended refused the
  // role with 42501 and the action threw (HTTP 500), leaving a `registered` walk_in row. The role is refused first.
  it.each(['body_admin', 'auditor'])('%s cannot check people in: refused with a plain message and NO registration is inserted', async (role) => {
    mockRequireStaff.mockResolvedValueOnce({ ...staff, role });
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });

    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({
      error: 'Your role cannot check people in. Ask an organiser admin or member.',
    });
    expect(mockFrom).toHaveBeenCalledTimes(1); // the event read only: no registrations insert, no email_log
  });

  // A role the pre-check lets through but the database still refuses (drift) must not 500 after the insert either.
  it('a 42501 from mark_attended after the insert (role allowed) says the person is registered, with the code and the neutral reason', async () => {
    markAttendedRpcError = { code: '42501', message: 'permission denied' };
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({
      error: 'Walk In was registered (code WK-TEST1) but not checked in. You cannot check people in on this event.',
    });
  });

  // Any other failure of the check-in leg (a dropped connection) used to throw with the row left behind.
  it('any other failure of the check-in after the insert names the person, the code and how to finish', async () => {
    markAttendedRpcError = { code: '57014', message: 'canceling statement due to statement timeout' };
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({
      error: 'Walk In was registered (code WK-TEST1) but not checked in. Use Enter code with WK-TEST1 to finish.',
    });
  });

  // The cause is logged (code only, UUIDs only, no PII) so a timeout and a bug are not the same silence in the logs.
  it('the check-in leg failure logs the error code with the registration id and nothing personal', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    markAttendedRpcError = { code: '57014', message: 'canceling statement due to statement timeout' };
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    await walkInRegisterAndCheckIn(validInput);
    expect(spy).toHaveBeenCalledWith('[walk-in] check-in leg threw after the registration', { regId: 'reg-1', code: '57014', name: undefined });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/walk@in\.test|Walk In|WK-TEST1/);
    spy.mockRestore();
  });

  it.each([
    ['live', LIVE_TIMES],
    ['not yet open', NOT_YET_OPEN_TIMES],
    ['ended', ENDED_TIMES],
  ])("another organisation's staff get the access error for a %s event, whatever its lifecycle", async (_label, times) => {
    mockRequireStaff.mockResolvedValueOnce({ ...staff, organisation_id: 'org-other' });
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...times });
    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({ error: 'You do not have access to this event.' });
  });

  // Q45, 2026-10-14: a server-side sign-out mid-event must come back as a
  // message, not a throw that froze the dialog on "Registering…".
  const SIGNED_OUT = "You've been signed out. This walk-in was not saved. Reload and log in again.";

  it('signed out (session ended server-side): returns the signed-out message instead of throwing', async () => {
    mockRequireStaff.mockRejectedValueOnce(new MockNotAuthorizedError('no session'));
    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({ error: SIGNED_OUT });
  });

  it('the rejection that signed the organiser out says so, not "please wait"', async () => {
    mockRateLimitBySession.mockResolvedValueOnce({ allowed: false, retryAfterMs: 1000, firstRejection: true, sessionRevoked: true });
    await expect(walkInRegisterAndCheckIn(validInput)).resolves.toEqual({ error: SIGNED_OUT });
  });

  it('happy path: registers + checks in', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toMatchObject({ ok: true, registration: { full_name: 'Walk In', code: 'WK-TEST1' } });
  });

  it('rejects non-manager staff (different org)', async () => {
    mockRequireStaff.mockResolvedValue({ ...staff, organisation_id: 'other-org' });
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'You do not have access to this event.' });
  });

  it('rejects duplicate email (23505)', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockRegInsert(null, { code: '23505', message: 'registrations_event_id_email_key' });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This email is already registered. Use code entry to check them in.' });
  });

  it('rejects at-capacity event', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: 1, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });
    mockCapacityCount(1);

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This event is at capacity.' });
  });

  it('rejects invalid input', async () => {
    const res = await walkInRegisterAndCheckIn({ eventId: 'bad', fullName: '', email: 'nope' });
    expect(res).toHaveProperty('error');
  });

  it('rejects deleted event', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: '2026-01-01', ...LIVE_TIMES });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This event is not available for walk-in registration.' });
  });

  // Regression: status alone (`published`) is not enough to gate this —
  // pg_cron never flips it to 'completed' (Stage 8, deferred), so an event
  // that ended hours ago still has status: 'published' here, same as a
  // genuinely live one. Only computeLifecycle() (start/end-time-derived)
  // catches this; a bare `status !== 'published'` check, which is all this
  // action used to have, would incorrectly accept the walk-in below.
  it('rejects a walk-in on an event that ended, even though status is still "published"', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...ENDED_TIMES });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'Check-in is closed. This event has ended.' });
  });

  it('rejects a walk-in on a cancelled event', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'cancelled', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...LIVE_TIMES });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This event was cancelled. Check-in is closed.' });
  });

  it('rejects a walk-in on an event that has not started yet', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null, ...NOT_YET_OPEN_TIMES });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'Check-in has not opened yet. It opens 60 minutes before the event starts.' });
  });
});
