import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Mocked send-side facades. The action picks one via env switch at call time
// (`process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub`), so per-test
// env mutation works without resetModules() — both mocks are loaded; only the
// branch under test gets called.
// vi.hoisted() runs before vi.mock factories (which are themselves hoisted
// above all imports), so the fns exist when the mock factories execute.
const { mockSendReal, mockSendStub } = vi.hoisted(() => ({
  mockSendReal: vi.fn(),
  mockSendStub: vi.fn(),
}));

// Captures the columns the event SELECT actually requests, so a test can pin
// that deleted_at is fetched (the soft-delete gate is only real if it is).
const { colCapture } = vi.hoisted(() => ({ colCapture: { eventCols: '' } }));
vi.mock('@/lib/resend', () => ({ sendEmail: mockSendReal }));
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));

// Rate limit: allow by default. Tests can override per-case if needed.
vi.mock('@/lib/rateLimit', () => ({
  rateLimitByIp: vi.fn(async () => ({ allowed: true, remaining: 29, resetAt: new Date() })),
}));

// next/cache revalidatePath: no-op (we don't assert on it for the email-path tests).
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// renderConfirmationEmail is a real async string-producer. Letting it run is
// fine (pure presentation, no I/O), but mocking keeps tests fast and isolates
// us from React Email rendering surface area.
vi.mock('@/emails/confirmation', () => ({
  renderConfirmationEmail: vi.fn(async () => '<html>stub</html>'),
}));

// getRequestOrigin reads next/headers in dev fallback; in the test runner
// there's no request context, so mock it.
vi.mock('@/lib/origin', () => ({
  getRequestOrigin: vi.fn(async () => 'http://localhost:3000'),
}));

// formatInTz is a pure function over Intl.DateTimeFormat; safe to let run, but
// mocking it gives the test deterministic strings without timezone-data noise.
vi.mock('@/lib/tz', () => ({
  formatInTz: vi.fn(() => '15 Jun 2026, 09:00'),
}));

// registrationCode generator: stub to a fixed code so the .insert assertion
// is deterministic and the retry loop terminates on attempt 0.
vi.mock('@/lib/registrationCode', () => ({
  generateRegistrationCode: vi.fn(() => 'WK-ABCDEF'),
}));

// --- Supabase mocks ---
//
// supabaseServer is only used for the step-2 event SELECT (anon-RLS read).
// supabaseAdmin handles step-3 capacity count (skipped here by leaving
// max_attendees=null), step-4 email_log INSERT, step-5 registrations INSERT,
// and step-7 email_log UPDATE.
//
// Mutable per-test state (reset in beforeEach):
const eventId = '11111111-2222-4333-8444-555555555555';
const logId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const regId = '77777777-bbbb-4ccc-8ddd-eeeeeeeeeeee';

type EventRow = {
  id: string;
  title: string;
  status: string;
  max_attendees: number | null;
  start_time: string;
  end_time: string;
  timezone: string;
  venue_name: string;
  venue_address: string | null;
  registration_close_at: string | null;
  deleted_at: string | null;
};
let mockEventRow: EventRow | null = null;
let lastEmailLogUpdate: Record<string, unknown> | null = null;
let lastEmailLogUpdateId: string | null = null;

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    from: (_table: string) => ({
      select: (cols: string) => {
        colCapture.eventCols = cols;
        return {
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({ data: mockEventRow, error: null }),
          }),
        };
      },
    }),
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'email_log') {
        return {
          insert: (_payload: Record<string, unknown>) => ({
            select: (_cols: string) => ({
              single: async () => ({ data: { id: logId }, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            lastEmailLogUpdate = payload;
            return {
              eq: async (_col: string, val: string) => {
                lastEmailLogUpdateId = val;
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'registrations') {
        return {
          // Capacity check path (.select('id', { count, head })). Not used in
          // these tests because mockEventRow.max_attendees is null, but kept
          // shape-compatible so a future capacity-path test slots in.
          select: (_cols: string, _opts?: { count?: string; head?: boolean }) => ({
            eq: async (_col: string, _val: string) => ({ count: 0, error: null }),
          }),
          insert: (_payload: Record<string, unknown>) => ({
            select: (_cols: string) => ({
              single: async () => ({
                data: { id: regId, registration_code: 'WK-ABCDEF' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

import { beforeEach, describe, it, expect } from 'vitest';
import { registrationInputSchema } from './schema';
import { registerForEvent } from './actions';

// Real v4 UUID (third group starts with 4, fourth with 8|9|a|b) — Zod 4's
// .uuid() validator is version-strict.
const valid = {
  event_id: '11111111-2222-4333-8444-555555555555',
  full_name: 'Ivan Lee',
  email: 'ivan@example.com',
};

describe('registrationInputSchema', () => {
  it('accepts a valid registration', () => {
    expect(registrationInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing full_name', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: '' });
    expect(r.success).toBe(false);
  });

  it('rejects full_name longer than 100 chars', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('rejects malformed email', () => {
    expect(registrationInputSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, email: '@nodomain.com'  }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, email: 'no-at-sign'      }).success).toBe(false);
  });

  it('rejects non-uuid event_id', () => {
    expect(registrationInputSchema.safeParse({ ...valid, event_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('trims and lowercases email so duplicate-detection works', () => {
    const r = registrationInputSchema.safeParse({ ...valid, email: '  Ivan@Example.COM  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ivan@example.com');
  });

  it('trims full_name', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: '  Ivan  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.full_name).toBe('Ivan');
  });
});

// Event times are relative to "now" so the lifecycle gate (registration must
// be open at submit time) sees a future event regardless of when the suite
// runs. Hardcoded dates here would make the suite start failing the day the
// fixture event "happens".
const HOUR = 3_600_000;
function futureEventRow(): EventRow {
  return {
    id: eventId,
    title: 'Workshop on Tuesdays',
    status: 'published',
    max_attendees: null, // skip capacity check
    start_time: new Date(Date.now() + 72 * HOUR).toISOString(),
    end_time: new Date(Date.now() + 75 * HOUR).toISOString(),
    timezone: 'Europe/Vilnius',
    venue_name: 'Office HQ',
    venue_address: 'Gedimino 1, Vilnius',
    registration_close_at: null,
    deleted_at: null,
  };
}

describe('registerForEvent — Phase 7 send-side behaviour', () => {
  beforeEach(() => {
    mockEventRow = futureEventRow();
    lastEmailLogUpdate = null;
    lastEmailLogUpdateId = null;
    mockSendReal.mockReset();
    mockSendStub.mockReset();
    delete process.env.RESEND_API_KEY;
  });

  it('uses devEmailStub when RESEND_API_KEY is unset → email_log stays queued', async () => {
    mockSendStub.mockResolvedValueOnce({ skipped: true });

    const result = await registerForEvent(valid);

    // emailDelivery: 'queued_dev' tells the success UI to say "dev mode" rather
    // than lie about a message having been sent (playbook §1.2.C).
    expect(result).toEqual({ ok: true, emailDelivery: 'queued_dev' });
    expect(mockSendStub).toHaveBeenCalledTimes(1);
    expect(mockSendReal).not.toHaveBeenCalled();

    // Ledger update only sets registration_id; status stays 'queued' (set at step 4).
    expect(lastEmailLogUpdate).toEqual({ registration_id: regId });
    expect(lastEmailLogUpdateId).toBe(logId);
  });

  it('uses real sender when RESEND_API_KEY is set; ok response → email_log sent', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    mockSendReal.mockResolvedValueOnce({ ok: true, id: 're_test_xyz' });

    const result = await registerForEvent(valid);

    expect(result).toEqual({ ok: true, emailDelivery: 'sent' });
    expect(mockSendReal).toHaveBeenCalledTimes(1);
    expect(mockSendStub).not.toHaveBeenCalled();

    expect(lastEmailLogUpdate).toMatchObject({
      registration_id: regId,
      status: 'sent',
    });
    expect(typeof lastEmailLogUpdate?.sent_at).toBe('string');
    expect(lastEmailLogUpdateId).toBe(logId);
  });

  it('uses real sender; error response → email_log failed with code+message', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    mockSendReal.mockResolvedValueOnce({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests' },
    });

    const result = await registerForEvent(valid);

    // Registration still succeeds; emailDelivery reports the honest failure so
    // the success UI can tell the visitor to show the screen to staff.
    expect(result).toEqual({ ok: true, emailDelivery: 'failed' });
    expect(mockSendReal).toHaveBeenCalledTimes(1);

    expect(lastEmailLogUpdate).toEqual({
      registration_id: regId,
      status: 'failed',
      error: 'rate_limit_exceeded: Too many requests',
    });
    expect(lastEmailLogUpdateId).toBe(logId);
  });
});

describe('registerForEvent — registration window gate', () => {
  beforeEach(() => {
    mockEventRow = futureEventRow();
    lastEmailLogUpdate = null;
    lastEmailLogUpdateId = null;
    mockSendReal.mockReset();
    mockSendStub.mockReset();
    delete process.env.RESEND_API_KEY;
  });

  it('rejects when registration_close_at has passed', async () => {
    mockEventRow!.registration_close_at = new Date(Date.now() - 1 * HOUR).toISOString();

    const result = await registerForEvent(valid);

    expect(result).toEqual({ error: 'Registration for this event has closed.' });
    // No side effects: nothing sent, no email_log touched.
    expect(mockSendStub).not.toHaveBeenCalled();
    expect(mockSendReal).not.toHaveBeenCalled();
    expect(lastEmailLogUpdate).toBeNull();
  });

  it('rejects once the check-in window opens (60 min before start), even with no close date', async () => {
    mockEventRow!.start_time = new Date(Date.now() + 0.5 * HOUR).toISOString();
    mockEventRow!.end_time = new Date(Date.now() + 3 * HOUR).toISOString();

    const result = await registerForEvent(valid);

    expect(result).toEqual({ error: 'Registration for this event has closed.' });
    expect(mockSendStub).not.toHaveBeenCalled();
  });

  it('rejects when the event has already ended', async () => {
    mockEventRow!.start_time = new Date(Date.now() - 5 * HOUR).toISOString();
    mockEventRow!.end_time = new Date(Date.now() - 2 * HOUR).toISOString();

    const result = await registerForEvent(valid);

    expect(result).toEqual({ error: 'This event has already ended.' });
    expect(mockSendStub).not.toHaveBeenCalled();
  });

  it('accepts when registration_close_at is still in the future', async () => {
    mockEventRow!.registration_close_at = new Date(Date.now() + 1 * HOUR).toISOString();
    mockSendStub.mockResolvedValueOnce({ skipped: true });

    const result = await registerForEvent(valid);

    expect(result).toEqual({ ok: true, emailDelivery: 'queued_dev' });
    expect(mockSendStub).toHaveBeenCalledTimes(1);
  });

  // A soft-deleted event keeps status='published' (softDeleteEvents only sets
  // deleted_at), and every sibling consumer — /events, the cron dispatcher,
  // self_check_in — filters deleted_at. registerForEvent did not, so a deleted
  // event kept taking registrations via its direct URL: the registrant got a
  // confirmation email and was turned away at the door. Security review 2026-08-06.
  it('rejects a soft-deleted event even while status is still published', async () => {
    mockEventRow!.deleted_at = new Date(Date.now() - 1 * HOUR).toISOString();

    const result = await registerForEvent(valid);

    expect(result).toEqual({ error: 'Registrations are not open for this event.' });
    expect(mockSendStub).not.toHaveBeenCalled();
    expect(mockSendReal).not.toHaveBeenCalled();
    // The gate is only real if the column is actually fetched.
    expect(colCapture.eventCols).toContain('deleted_at');
  });
});
