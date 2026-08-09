import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// The send core is exercised for real in emailActions.test.ts and live in
// tests/cron/. Here it is mocked so these tests are about the guard, the
// selection wiring, and the response contract.
const { mockSendReminder, mockSendSurvey } = vi.hoisted(() => ({
  mockSendReminder: vi.fn(),
  mockSendSurvey: vi.fn(),
}));
vi.mock('@/lib/email/eventEmails', () => ({
  sendReminderToRegistrants: mockSendReminder,
  sendSurveyInviteToAttendees: mockSendSurvey,
  // The route builds its whole-event-throw result from the real zero(), so the
  // shape stays in lockstep with SendResult rather than drifting in a literal.
  zero: (error?: string) => ({
    sent: 0, queued: 0, skipped: 0, stalled: 0, failed: 0, gaveUp: 0,
    ...(error ? { error } : {}),
  }),
}));

type Row = Record<string, unknown>;
let mockEventRows: Row[];
let eventFilters: Array<[string, unknown]>;
// Registered-recipient count per event id, for the recipient-budget batching.
let mockRegistrationCounts: Record<string, number>;

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'registrations') {
        // Mirrors the route's head:true count-per-event read.
        const chain = {
          _event: '',
          eq(col: string, val: string) {
            if (col === 'event_id') chain._event = val;
            return chain;
          },
          in: () => chain,
          then(onF: (v: { count: number; error: null }) => unknown) {
            return Promise.resolve({ count: mockRegistrationCounts[chain._event] ?? 1, error: null }).then(onF);
          },
        };
        return { select: () => chain };
      }
      if (table !== 'events') throw new Error(`unexpected admin table: ${table}`);
      const chain = {
        in(col: string, val: unknown) {
          eventFilters.push([col, val]);
          return chain;
        },
        gte(col: string, val: unknown) {
          eventFilters.push([col, val]);
          return chain;
        },
        lte(col: string, val: unknown) {
          eventFilters.push([col, val]);
          return chain;
        },
        is(col: string, val: unknown) {
          eventFilters.push([col, val]);
          return chain;
        },
        then(onF: (v: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: mockEventRows, error: null }).then(onF);
        },
      };
      return { select: () => chain };
    },
  })),
}));

import { beforeEach, describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const SECRET = 'test-cron-secret-value';
const HOUR = 3_600_000;

function req(secret?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/dispatch', {
    method: 'POST',
    ...(secret ? { headers: { 'x-cron-secret': secret } } : {}),
  });
}

// Vercel Cron can only issue GET, and authenticates with a Bearer header.
// curl and pg_net use POST + x-cron-secret. Both must reach the same logic, or
// swapping the trigger stops being a one-file change.
function bearerReq(secret: string, method: 'GET' | 'POST' = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/dispatch', {
    method,
    headers: { authorization: `Bearer ${secret}` },
  });
}

// Sits squarely inside the reminder window: starts in 30 min.
function reminderDueRow(overrides: Row = {}): Row {
  return {
    id: 'evt-reminder',
    title: 'Q3 All-Hands',
    status: 'published',
    start_time: new Date(Date.now() + 0.5 * HOUR).toISOString(),
    end_time: new Date(Date.now() + 2 * HOUR).toISOString(),
    registration_close_at: null,
    registration_open_at: null,
    timezone: 'Asia/Hong_Kong',
    venue_name: 'HQ',
    venue_address: '12/F Central',
    created_by: 'staff-1',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  delete process.env.RESEND_API_KEY;
  mockEventRows = [];
  eventFilters = [];
  mockRegistrationCounts = {};
  mockSendReminder.mockReset().mockResolvedValue({ sent: 0, queued: 2, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
  mockSendSurvey.mockReset().mockResolvedValue({ sent: 0, queued: 1, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });
});

describe('POST /api/cron/dispatch — the guard', () => {
  it('rejects a request with no secret header', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(req('not-the-secret'));
    expect(res.status).toBe(401);
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  // Fail CLOSED. An unset secret must never mean "open to everyone" — that
  // would make a misconfigured deploy a public mass-mail trigger.
  it('refuses to run at all when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(SECRET));
    expect(res.status).toBe(503);
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it('accepts the correct secret', async () => {
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
  });

  it('accepts an Authorization: Bearer secret, so a Vercel cron entry works', async () => {
    const res = await GET(bearerReq(SECRET));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong Bearer secret', async () => {
    const res = await GET(bearerReq('nope'));
    expect(res.status).toBe(401);
  });

  it('GET and POST run the same dispatch logic', async () => {
    mockEventRows = [reminderDueRow()];

    const viaPost = await (await POST(req(SECRET))).json();
    mockSendReminder.mockClear();
    const viaGet = await (await GET(bearerReq(SECRET))).json();

    expect(viaGet.dispatched).toEqual(viaPost.dispatched);
    expect(mockSendReminder).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/cron/dispatch — dispatching', () => {
  it('sends the reminder for an event inside its reminder window', async () => {
    mockEventRows = [reminderDueRow()];

    const res = await POST(req(SECRET));
    const body = await res.json();

    expect(mockSendReminder).toHaveBeenCalledTimes(1);
    expect(mockSendSurvey).not.toHaveBeenCalled();
    expect(body.dispatched).toEqual([
      { eventId: 'evt-reminder', purpose: 'reminder', sent: 0, queued: 2, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 },
    ]);
  });

  it('dispatches nothing when no event has an open window', async () => {
    mockEventRows = [reminderDueRow({ start_time: new Date(Date.now() + 5 * HOUR).toISOString() })];

    const res = await POST(req(SECRET));
    const body = await res.json();

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(body.dispatched).toEqual([]);
  });

  it('bounds the candidate query by status and time rather than scanning all history', async () => {
    await POST(req(SECRET));
    const cols = eventFilters.map(([c]) => c);
    expect(cols).toContain('status');
    expect(cols).toContain('end_time');
    expect(cols).toContain('start_time');
  });

  // events.deleted_at is a soft delete; /events, /checkin and /analytics all
  // filter it. Mailing a deleted event's registrants would be indefensible.
  it('excludes soft-deleted events from the candidate query', async () => {
    await POST(req(SECRET));
    expect(eventFilters).toContainEqual(['deleted_at', null]);
  });

  // A local run reports queued, not sent. Without this an all-green cron run
  // reads as "mail delivered" when nothing left the building.
  it('reports delivery as stubbed when RESEND_API_KEY is unset', async () => {
    const body = await (await POST(req(SECRET))).json();
    expect(body.delivery).toBe('stubbed');
  });

  it('reports delivery as live when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    const body = await (await POST(req(SECRET))).json();
    expect(body.delivery).toBe('live');
  });

  it('returns no PII — only ids, purposes and counts', async () => {
    mockEventRows = [reminderDueRow()];
    const raw = await (await POST(req(SECRET))).text();
    expect(raw).not.toContain('Q3 All-Hands');
    expect(raw).not.toContain('HQ');
    expect(raw).not.toContain('Central');
  });

  it('caps work per invocation and flags that more remain', async () => {
    mockEventRows = Array.from({ length: 25 }, (_, i) => reminderDueRow({ id: `evt-${i}` }));

    const body = await (await POST(req(SECRET))).json();

    expect(body.dispatched).toHaveLength(20);
    expect(body.morePending).toBe(true);
    expect(mockSendReminder).toHaveBeenCalledTimes(20);
  });

  // The cap is a time bound, not a priority scheme. If selection order were
  // arbitrary, a backlog of surveys (24h of grace left) could fill every slot
  // and push out a reminder whose window shuts at start_time — and unlike a
  // survey, a reminder missed is a QR pass that never arrives at the door.
  it('dispatches an urgent reminder even when the cap is filled with surveys', async () => {
    const surveys = Array.from({ length: 20 }, (_, i) =>
      reminderDueRow({
        id: `survey-${i}`,
        start_time: new Date(Date.now() - 3 * HOUR).toISOString(),
        end_time: new Date(Date.now() - 1 * HOUR).toISOString(),
      }),
    );
    mockEventRows = [...surveys, reminderDueRow({ id: 'evt-urgent' })];

    const body = await (await POST(req(SECRET))).json();

    expect(body.dispatched).toHaveLength(20);
    expect(body.morePending).toBe(true);
    expect(body.dispatched[0]).toMatchObject({ eventId: 'evt-urgent', purpose: 'reminder' });
    expect(mockSendReminder).toHaveBeenCalledTimes(1);
  });

  // The cap has to bound the WORK, not the event count. 20 events x 200
  // registrants is 4000 sequential sends (QR render + email render + provider
  // round-trip each) against a 60s function budget — a kill mid-batch leaves
  // rows at 'queued', which is TERMINAL, so a timeout is permanent mail loss.
  it('stops adding events once the recipient budget is reached', async () => {
    mockRegistrationCounts = { 'evt-0': 400, 'evt-1': 400, 'evt-2': 400 };
    mockEventRows = [
      reminderDueRow({ id: 'evt-0' }),
      reminderDueRow({ id: 'evt-1' }),
      reminderDueRow({ id: 'evt-2' }),
    ];

    const body = await (await POST(req(SECRET))).json();

    expect(body.dispatched.length).toBeLessThan(3);
    expect(body.morePending).toBe(true);
  });

  // A single event larger than the whole budget must still go out, or it would
  // be starved forever while smaller ones jump it every tick.
  it('always dispatches at least one event, even one bigger than the budget', async () => {
    mockRegistrationCounts = { 'evt-huge': 100_000 };
    mockEventRows = [reminderDueRow({ id: 'evt-huge' })];

    const body = await (await POST(req(SECRET))).json();

    expect(body.dispatched).toHaveLength(1);
    expect(body.morePending).toBe(false);
  });

  it('does not flag morePending when everything due was handled', async () => {
    mockEventRows = [reminderDueRow()];
    const body = await (await POST(req(SECRET))).json();
    expect(body.morePending).toBe(false);
  });

  // One event failing must not abort the batch (rule 12: surface it, continue).
  it('continues past an event whose send throws, and reports it', async () => {
    mockEventRows = [reminderDueRow({ id: 'evt-a' }), reminderDueRow({ id: 'evt-b' })];
    mockSendReminder
      .mockRejectedValueOnce(new Error('resend exploded'))
      .mockResolvedValueOnce({ sent: 1, queued: 0, skipped: 0, stalled: 0, failed: 0, gaveUp: 0 });

    const body = await (await POST(req(SECRET))).json();

    expect(mockSendReminder).toHaveBeenCalledTimes(2);
    expect(body.dispatched).toHaveLength(2);
    // A whole-event throw is reported as a batch error, not as "1 failed" —
    // that number read as one recipient when the entire roster was skipped.
    expect(body.dispatched[0]).toMatchObject({ eventId: 'evt-a', failed: 0 });
    expect(body.dispatched[0].error).toMatch(/no recipients were processed/i);
    expect(body.ok).toBe(false);
    expect(body.dispatched[1]).toMatchObject({ eventId: 'evt-b', sent: 1 });
  });
});
