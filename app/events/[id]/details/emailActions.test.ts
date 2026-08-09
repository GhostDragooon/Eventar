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

// Renders from its props so payload-stability assertions are real. A constant
// return value would make any such test vacuous — the volatile field lives in
// the props, so it has to reach the output.
const { mockRenderReminder } = vi.hoisted(() => ({
  mockRenderReminder: vi.fn(async (props: Record<string, unknown>) => `<html>${JSON.stringify(props)}</html>`),
}));
vi.mock('@/emails/reminder', () => ({ renderReminderEmail: mockRenderReminder }));
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
// Prior 'failed' rows for this (event, purpose) — the attempt-cap read.
let mockEmailLogFailures: Array<{ registration_id: string; status?: string; origin?: string }>;
// Simulates the recipient query failing (DB blip mid-cron-tick).
let mockRegistrationsError: { code: string; message: string } | null;
let emailLogQueryFilters: Array<[string, string]>;
let emailLogQueryLimit: number | null;

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
          then(onF: (v: { data: Reg[] | null; error: { code: string; message: string } | null }) => unknown) {
            return Promise.resolve(
              mockRegistrationsError
                ? { data: null, error: mockRegistrationsError }
                : { data: mockRegistrations, error: null },
            ).then(onF);
          },
        };
        return { select: () => chain };
      }
      if (table === 'email_log') {
        return {
          select: () => {
            const chain = {
              // Records filters rather than discarding them — otherwise
              // deleting .eq('status','failed') from the production query
              // leaves every test green (mirrors regQueryFilters above).
              eq(col: string, val: string) {
                emailLogQueryFilters.push([col, val]);
                return chain;
              },
              // The prior-send read is explicitly bounded (PostgREST truncates
              // silently at db.max_rows), so the mock must model .limit().
              limit(n: number) {
                emailLogQueryLimit = n;
                return chain;
              },
              then: (onF: (v: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
                Promise.resolve({
                  data: mockEmailLogFailures.map((r) => ({ status: 'failed', origin: 'scheduler', ...r })),
                  error: null,
                }).then(onF),
            };
            return chain;
          },
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
// The session-less core the SCHEDULER calls. The actions above are the MANUAL
// path; the two differ on the retry budget, so both are exercised here.
import { sendReminderToRegistrants } from '@/lib/email/eventEmails';
import { composeSendMessage } from '@/lib/emailSendSummary';

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
  mockEmailLogFailures = [];
  mockRegistrationsError = null;
  emailLogQueryFilters = [];
  emailLogQueryLimit = null;
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

    expect(result).toEqual({ sent: 0, queued: 2, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
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

    expect(result).toEqual({ sent: 2, queued: 0, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
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

    expect(result).toEqual({ sent: 1, queued: 0, skipped: 0, stalled: 0, failed: 1, gaveUp: 0 });
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

    expect(result).toEqual({ sent: 0, queued: 1, skipped: 1, stalled: 0, failed: 0, gaveUp: 0 });
    // Only the non-colliding recipient got a send attempt.
    expect(mockSendStub).toHaveBeenCalledTimes(1);
  });

  // Failed rows are retryable by design (20260805000000), which without a cap
  // means a permanently-bad address is retried on every tick for the whole
  // window — 288 times across a survey's 24h grace. That burns provider quota
  // the live sends need, so a dead address must not be able to starve a good one.
  it('the scheduler gives up on a recipient after 3 failed attempts, and still sends to the others', async () => {
    mockEmailLogFailures = [
      { registration_id: 'reg-1' },
      { registration_id: 'reg-1' },
      { registration_id: 'reg-1' },
    ];

    const result = await sendReminderToRegistrants(eventRow());

    // Scope the prior-send read to THIS (event, purpose). Without these,
    // another event's failures count as attempts and recipients get given up
    // on who never failed. Status/origin are filtered in JS now, because the
    // same read also has to tell a stale 'queued' row from a delivered one.
    expect(emailLogQueryFilters).toContainEqual(['event_id', eventId]);
    expect(emailLogQueryFilters).toContainEqual(['purpose', 'reminder']);
    // Bounded, or PostgREST silently truncates at db.max_rows and the budget
    // becomes an undercount nobody sees.
    expect(emailLogQueryLimit).toBeGreaterThan(0);

    // reg-1 is given up on: no fourth ledger row, no fourth send attempt.
    expect(emailLogInserts.map((i) => i.registration_id)).toEqual(['reg-2']);
    expect(mockSendStub).toHaveBeenCalledTimes(1);
    // Reported as its OWN outcome. Not `skipped` (renders "already sent" —
    // rule 12 forbids a loss reading as success) and not `failed` either: a
    // failure retries next tick, a give-up never will, and those demand
    // opposite actions from the operator.
    expect(result.gaveUp).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.queued).toBe(1);
  });

  it('the scheduler still retries a recipient who has failed fewer than 3 times', async () => {
    mockEmailLogFailures = [{ registration_id: 'reg-1' }, { registration_id: 'reg-1' }];

    const result = await sendReminderToRegistrants(eventRow());

    expect(emailLogInserts.map((i) => i.registration_id)).toEqual(['reg-1', 'reg-2']);
    expect(result.queued).toBe(2);
    expect(result.gaveUp).toBe(0);
  });

  // The retry budget exists to stop an AUTOMATED storm against a dead address.
  // A human clicking "Send reminders now" is not a storm — and it is the only
  // rescue lever they have. If the budget governed it too, the button would be
  // a silent no-op for exactly the recipients who need rescuing, and three
  // troubleshooting clicks during a provider blip would exhaust the budget
  // themselves.
  // A DB blip mid-tick previously returned [] from readRecipients, which the
  // caller reads as "nobody to email" — so an entire event's reminders were
  // skipped and reported as success. Rule 12: a read failure is not an empty
  // roster.
  it('a failed recipient read is surfaced, never rendered as "no one to email"', async () => {
    mockRegistrationsError = { code: '08006', message: 'connection reset' };

    const result = await sendReminderForEvent(eventId);

    expect(result.error).toBeTruthy();
    expect(emailLogInserts).toHaveLength(0);
    expect(mockSendStub).not.toHaveBeenCalled();
    expect(composeSendMessage('reminder', result)).not.toMatch(/No registered attendees/i);
  });

  // THE regression guard for the idempotency key. Resend rejects a reused key
  // whose payload differs (409), so any wall-clock value in the rendered email
  // makes every scheduler retry fail — the exact path the retry exists for.
  // The manual send is never retried and deliberately keeps a live countdown.
  it('the scheduler payload is byte-identical across ticks, so a retry keeps its key valid', async () => {
    const start = new Date('2026-06-01T10:00:00Z').getTime();
    const fixed = eventRow({
      start_time: new Date(start).toISOString(),
      end_time: new Date(start + 2 * HOUR).toISOString(),
    });
    const nowSpy = vi.spyOn(Date, 'now');

    try {
      nowSpy.mockReturnValue(start - 60 * 60_000); // T−60, first tick
      await sendReminderToRegistrants(fixed);
      const firstTick = mockSendStub.mock.calls[0][0];

      mockSendStub.mockClear();
      nowSpy.mockReturnValue(start - 55 * 60_000); // T−55, retry tick
      await sendReminderToRegistrants(fixed);
      const retryTick = mockSendStub.mock.calls[0][0];

      expect(retryTick.html).toBe(firstTick.html);
      expect(retryTick.subject).toBe(firstTick.subject);
      // Same key must accompany the same bytes, or Resend cannot dedupe.
      expect(retryTick.idempotencyKey).toBe(firstTick.idempotencyKey);
    } finally {
      nowSpy.mockRestore();
    }
  });

  // Resend already holds this key, so the earlier request was accepted and the
  // mail is delivered or in flight. Not a failure, and NOT retryable — mark it
  // terminal or the recipient burns the whole retry budget on 409s.
  it('treats a 409 idempotency conflict as already delivered, not a failure', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSendReal.mockResolvedValue({
      error: { code: 'invalid_idempotent_request', message: 'different payload', statusCode: 409 },
    });

    const result = await sendReminderToRegistrants(eventRow());

    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(emailLogUpdates.every((u) => u.payload.status === 'sent')).toBe(true);
  });

  it('the manual re-send button ignores the automatic retry budget', async () => {
    mockEmailLogFailures = [
      { registration_id: 'reg-1' },
      { registration_id: 'reg-1' },
      { registration_id: 'reg-1' },
    ];

    const result = await sendReminderForEvent(eventId);

    expect(emailLogInserts.map((i) => i.registration_id)).toEqual(['reg-1', 'reg-2']);
    expect(mockSendStub).toHaveBeenCalledTimes(2);
    expect(result.gaveUp).toBe(0);
    expect(result.queued).toBe(2);
  });

  it('a non-23505 email_log insert failure is counted AND logged (UUIDs only, no PII)', async () => {
    mockEmailLogInsert = async () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendReminderForEvent(eventId);

    expect(result).toEqual({ sent: 0, queued: 0, skipped: 0, stalled: 0, failed: 2, gaveUp: 0 });
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
    expect(result).toEqual({ sent: 0, queued: 0, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
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

    expect(result).toEqual({ sent: 0, queued: 1, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
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
