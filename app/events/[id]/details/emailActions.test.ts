import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Env-switched send facades (real vs dev stub), mirroring registerForEvent.
const { mockSendReal, mockSendStub } = vi.hoisted(() => ({
  mockSendReal: vi.fn(),
  mockSendStub: vi.fn(),
}));
vi.mock('@/lib/resend', () => ({ sendEmail: mockSendReal }));
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/emails/reminder', () => ({
  renderReminderEmail: vi.fn(async () => '<html>reminder</html>'),
}));
vi.mock('@/emails/surveyInvite', () => ({
  renderSurveyInviteEmail: vi.fn(async () => '<html>survey</html>'),
}));
vi.mock('@/lib/checkinQr', () => ({
  buildCheckinQrPng: vi.fn(async (code: string) => ({
    pngBase64: 'UE5H',
    filename: `checkin-${code}.png`,
  })),
}));
vi.mock('@/lib/origin', () => ({
  getRequestOrigin: vi.fn(async () => 'http://localhost:3000'),
}));
vi.mock('@/lib/tz', () => ({
  formatInTz: vi.fn(() => '15 Jun 2026, 09:00'),
}));

// --- Auth ---
type Staff = { id: string; role: 'organiser_member' | 'eventar_staff'; email: string; full_name: string | null };
let mockStaff: Staff;
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => mockStaff),
  NotAuthorizedError: class NotAuthorizedError extends Error {},
}));

// --- Supabase mocks ---
const eventId = '11111111-2222-4333-8444-555555555555';
const ownerId = 'staff-owner-0000';

type EventRow = {
  id: string;
  title: string;
  status: string;
  start_time: string;
  end_time: string;
  timezone: string;
  venue_name: string;
  venue_address: string | null;
  created_by: string;
};
type Reg = { id: string; email: string; full_name: string; registration_code: string; status: string };

let mockEventRow: EventRow | null;
let mockRegistrations: Reg[];
let regQueryFilters: Array<[string, string]>;
let emailLogInserts: Array<Record<string, unknown>>;
let emailLogUpdates: Array<{ payload: Record<string, unknown>; id: string }>;
// Per-call email_log insert outcome. Default: unique id, no error.
let mockEmailLogInsert: (payload: Record<string, unknown>) => Promise<{ data: { id: string } | null; error: { code: string; message: string } | null }>;

// Everything the action touches goes through admin (RLS-independent, post-auth):
// the event read, the registrations recipient read, and all email_log mutations.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: mockEventRow, error: null }) }),
          }),
        };
      }
      if (table === 'registrations') {
        const chain = {
          eq(col: string, val: string) {
            regQueryFilters.push([col, val]);
            return chain;
          },
          then(onF: (v: { data: Reg[]; error: null }) => unknown) {
            return Promise.resolve({ data: mockRegistrations, error: null }).then(onF);
          },
        };
        return { select: () => chain };
      }
      if (table === 'email_log') {
        return {
          insert: (payload: Record<string, unknown>) => {
            emailLogInserts.push(payload);
            return { select: () => ({ single: async () => mockEmailLogInsert(payload) }) };
          },
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              emailLogUpdates.push({ payload, id });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected admin table: ${table}`);
    },
  })),
}));

import { beforeEach, describe, it, expect } from 'vitest';
import { sendReminderForEvent, sendSurveyInviteForEvent } from './emailActions';

const HOUR = 3_600_000;
function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: eventId,
    title: 'Q3 All-Hands',
    status: 'published',
    start_time: new Date(Date.now() + 1 * HOUR).toISOString(),
    end_time: new Date(Date.now() + 3 * HOUR).toISOString(),
    timezone: 'Asia/Hong_Kong',
    venue_name: 'HQ',
    venue_address: '12/F Central',
    created_by: ownerId,
    ...overrides,
  };
}

beforeEach(() => {
  mockStaff = { id: ownerId, role: 'organiser_member', email: 'owner@x.com', full_name: 'Owner' };
  mockEventRow = eventRow();
  mockRegistrations = [
    { id: 'reg-1', email: 'a@x.com', full_name: 'Alice A', registration_code: 'WK-AAA111', status: 'registered' },
    { id: 'reg-2', email: 'b@x.com', full_name: 'Bob B', registration_code: 'WK-BBB222', status: 'registered' },
  ];
  regQueryFilters = [];
  emailLogInserts = [];
  emailLogUpdates = [];
  let n = 0;
  mockEmailLogInsert = async () => ({ data: { id: `log-${++n}` }, error: null });
  mockSendReal.mockReset();
  mockSendStub.mockReset();
  // The dev stub always resolves { skipped: true } — encode that invariant so
  // tests that don't exercise the real sender still model stub behaviour.
  mockSendStub.mockResolvedValue({ skipped: true });
  delete process.env.RESEND_API_KEY;
});

describe('sendReminderForEvent — authorization', () => {
  it('refuses when the caller is neither owner nor manager', async () => {
    mockStaff = { id: 'someone-else', role: 'organiser_member', email: 'x@x.com', full_name: null };
    const result = await sendReminderForEvent(eventId);
    expect(result.error).toMatch(/not authorized/i);
    expect(result.sent + result.queued + result.skipped + result.failed).toBe(0);
    expect(emailLogInserts).toHaveLength(0);
    expect(mockSendStub).not.toHaveBeenCalled();
  });

  it('allows an eventar_staff who does not own the event', async () => {
    mockStaff = { id: 'mgr', role: 'eventar_staff', email: 'm@x.com', full_name: 'Mgr' };
    const result = await sendReminderForEvent(eventId);
    expect(result.error).toBeUndefined();
    expect(result.queued).toBe(2);
  });

  it('errors cleanly when the event is not found', async () => {
    mockEventRow = null;
    const result = await sendReminderForEvent(eventId);
    expect(result.error).toMatch(/not found/i);
  });
});

describe('sendReminderForEvent — send behaviour', () => {
  it('targets only registered recipients (status filter applied)', async () => {
    await sendReminderForEvent(eventId);
    expect(regQueryFilters).toContainEqual(['event_id', eventId]);
    expect(regQueryFilters).toContainEqual(['status', 'registered']);
  });

  it('stub path: inserts a reminder email_log per recipient, attaches the CID QR, returns queued count', async () => {
    mockSendStub.mockResolvedValue({ skipped: true });
    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 0, queued: 2, skipped: 0, failed: 0 });
    expect(mockSendStub).toHaveBeenCalledTimes(2);
    expect(mockSendReal).not.toHaveBeenCalled();

    // email_log rows inserted FIRST, purpose=reminder, registration_id set.
    expect(emailLogInserts).toHaveLength(2);
    expect(emailLogInserts[0]).toMatchObject({
      purpose: 'reminder',
      event_id: eventId,
      registration_id: 'reg-1',
      recipient_email: 'a@x.com',
      status: 'queued',
    });

    // The QR ships as an inline CID attachment referenced by the template.
    const firstCall = mockSendStub.mock.calls[0][0];
    expect(firstCall.attachments).toHaveLength(1);
    expect(firstCall.attachments[0]).toMatchObject({ content: 'UE5H' });
    expect(firstCall.attachments[0].contentId).toBeTruthy();
  });

  it('real path: ok response marks each email_log row sent', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    mockSendReal.mockResolvedValue({ ok: true, id: 're_x' });

    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 2, queued: 0, skipped: 0, failed: 0 });
    expect(mockSendReal).toHaveBeenCalledTimes(2);
    expect(emailLogUpdates).toHaveLength(2);
    expect(emailLogUpdates[0].payload).toMatchObject({ status: 'sent' });
    expect(typeof emailLogUpdates[0].payload.sent_at).toBe('string');
  });

  it('real path: a send error marks that row failed with code+message', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    mockSendReal
      .mockResolvedValueOnce({ ok: true, id: 're_1' })
      .mockResolvedValueOnce({ error: { code: 'rate_limit_exceeded', message: 'slow down' } });

    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 1, queued: 0, skipped: 0, failed: 1 });
    const failedUpdate = emailLogUpdates.find((u) => u.payload.status === 'failed');
    expect(failedUpdate?.payload.error).toBe('rate_limit_exceeded: slow down');
  });

  it('idempotency: a 23505 on the email_log insert skips that recipient without sending', async () => {
    let call = 0;
    mockEmailLogInsert = async () => {
      call += 1;
      if (call === 2) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      return { data: { id: `log-${call}` }, error: null };
    };
    mockSendStub.mockResolvedValue({ skipped: true });

    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 0, queued: 1, skipped: 1, failed: 0 });
    // Only the non-colliding recipient got a send attempt.
    expect(mockSendStub).toHaveBeenCalledTimes(1);
  });

  it('a non-23505 email_log insert failure is counted AND logged (UUIDs only, no PII)', async () => {
    mockEmailLogInsert = async () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 0, queued: 0, skipped: 0, failed: 2 });
    // Fails visibly (rule 12): a diagnosable trace exists...
    expect(errSpy).toHaveBeenCalled();
    // ...but never leaks recipient PII (rule 10).
    const logged = errSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(logged).not.toContain('a@x.com');
    expect(logged).not.toContain('Alice');
    // No send is attempted when the ledger insert fails.
    expect(mockSendStub).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns all-zero (no sends) when there are no registered recipients', async () => {
    mockRegistrations = [];
    const result = await sendReminderForEvent(eventId);
    expect(result).toEqual({ sent: 0, queued: 0, skipped: 0, failed: 0 });
    expect(mockSendStub).not.toHaveBeenCalled();
  });
});

describe('sendSurveyInviteForEvent', () => {
  it('targets attended recipients, inserts survey email_log rows, sends without QR attachment', async () => {
    mockRegistrations = [
      { id: 'reg-1', email: 'a@x.com', full_name: 'Alice A', registration_code: 'WK-AAA111', status: 'attended' },
    ];
    mockSendStub.mockResolvedValue({ skipped: true });

    const result = await sendSurveyInviteForEvent(eventId);

    expect(result).toEqual({ sent: 0, queued: 1, skipped: 0, failed: 0 });
    expect(regQueryFilters).toContainEqual(['status', 'attended']);
    expect(emailLogInserts[0]).toMatchObject({ purpose: 'survey', registration_id: 'reg-1' });
    // Survey invite carries no attachment.
    const call = mockSendStub.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it('refuses a non-owner non-manager', async () => {
    mockStaff = { id: 'nope', role: 'organiser_member', email: 'n@x.com', full_name: null };
    const result = await sendSurveyInviteForEvent(eventId);
    expect(result.error).toMatch(/not authorized/i);
  });
});
