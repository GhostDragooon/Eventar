import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockRequireStaff = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireStaff: (...args: unknown[]) => mockRequireStaff(...args),
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

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    rpc: async () => ({ data: [{ result: 'ok', ...markAttendedResult.registration }], error: null }),
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
  mockRequireStaff.mockReset().mockResolvedValue(staff);
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockRateLimitBySession.mockReset().mockResolvedValue({ allowed: true });
});

describe('walkInRegisterAndCheckIn', () => {
  it('happy path: registers + checks in', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null });
    mockRegInsert({ id: 'reg-1', registration_code: 'WK-TEST1' });
    mockEmailLogInsert();

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toMatchObject({ ok: true, registration: { full_name: 'Walk In', code: 'WK-TEST1' } });
  });

  it('rejects non-manager staff (different org)', async () => {
    mockRequireStaff.mockResolvedValue({ ...staff, organisation_id: 'other-org' });
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'You do not have access to this event.' });
  });

  it('rejects duplicate email (23505)', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: null });
    mockRegInsert(null, { code: '23505', message: 'registrations_event_id_email_key' });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This email is already registered. Use code entry to check them in.' });
  });

  it('rejects at-capacity event', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: 1, organisation_id: ORG_ID, deleted_at: null });
    mockCapacityCount(1);

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This event is at capacity.' });
  });

  it('rejects invalid input', async () => {
    const res = await walkInRegisterAndCheckIn({ eventId: 'bad', fullName: '', email: 'nope' });
    expect(res).toHaveProperty('error');
  });

  it('rejects deleted event', async () => {
    mockEventSelect({ id: EVENT_ID, title: 'Test', status: 'published', max_attendees: null, organisation_id: ORG_ID, deleted_at: '2026-01-01' });

    const res = await walkInRegisterAndCheckIn(validInput);
    expect(res).toEqual({ error: 'This event is not available for walk-in registration.' });
  });
});
