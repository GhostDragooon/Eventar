import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { mockSendReal, mockSendStub } = vi.hoisted(() => ({
  mockSendReal: vi.fn(),
  mockSendStub: vi.fn(),
}));
vi.mock('@/lib/resend', () => ({ sendEmail: mockSendReal }));
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));
vi.mock('@/emails/reminder', () => ({ renderReminderEmail: vi.fn(async () => '<html/>') }));
vi.mock('@/lib/checkinQr', () => ({
  buildCheckinQrPng: vi.fn(async (code: string) => ({ pngBase64: 'x', filename: `${code}.png` })),
}));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://x') }));

// A stateful email_log that honours the partial dedup index (a `failed` row
// does not block a re-insert), because the point is what a run LEAVES behind.
type LogRow = { id: string; registration_id: string; status: string; origin: string };
const rows: LogRow[] = [];
const regs = [
  { id: 'reg-1', email: 'a@example.com', full_name: 'A A', registration_code: 'WK-1' },
  { id: 'reg-2', email: 'b@example.com', full_name: 'B B', registration_code: 'WK-2' },
];

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'registrations') {
        const q: Record<string, unknown> = {};
        q.eq = () => q;
        q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: regs, error: null }).then(f);
        return { select: () => q };
      }
      return {
        select: () => {
          const q: Record<string, unknown> = {};
          q.eq = () => q;
          q.limit = () => q;
          q.then = (f: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows.map(({ registration_id, status, origin }) => ({ registration_id, status, origin })), error: null }).then(f);
          return q;
        },
        insert: (p: { registration_id: string; status: string; origin: string }) => ({
          select: () => ({
            single: async () => {
              if (rows.some((r) => r.registration_id === p.registration_id && r.status !== 'failed')) {
                return { data: null, error: { code: '23505' } };
              }
              const row = { id: `log-${rows.length + 1}`, registration_id: p.registration_id, status: p.status, origin: p.origin };
              rows.push(row);
              return { data: { id: row.id }, error: null };
            },
          }),
        }),
        update: (p: Partial<LogRow>) => ({
          eq: async (_col: string, id: string) => {
            Object.assign(rows.find((r) => r.id === id)!, p);
            return { error: null };
          },
        }),
      };
    },
  }),
}));

import { sendReminderToRegistrants } from './eventEmails';

const event = {
  id: 'ev-1',
  title: 'T',
  status: 'published',
  start_time: new Date(Date.now() + 30 * 60_000).toISOString(),
  end_time: new Date(Date.now() + 150 * 60_000).toISOString(),
  timezone: 'Asia/Hong_Kong',
  venue_name: 'V',
  venue_address: null,
  organisation_id: 'org-1',
};

beforeEach(() => {
  rows.length = 0;
  mockSendReal.mockReset().mockResolvedValue({ ok: true, id: 're_1' });
  mockSendStub.mockReset().mockResolvedValue({ skipped: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bulk send in production without an email key', () => {
  // MAX_SEND_ATTEMPTS is 3: a per-recipient `failed` row on each tick used to
  // spend the whole budget in three ticks, so adding the key afterwards never
  // recovered the scheduler path.
  it('is a batch error: no ledger rows, and the first tick after the key is set sends everyone', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');

    for (let tick = 1; tick <= 4; tick++) {
      const r = await sendReminderToRegistrants(event);
      expect(r.error).toMatch(/not configured/i);
      expect(r).toMatchObject({ sent: 0, failed: 0, gaveUp: 0 });
    }
    expect(rows).toHaveLength(0);
    expect(mockSendReal).not.toHaveBeenCalled();
    expect(mockSendStub).not.toHaveBeenCalled();

    vi.stubEnv('RESEND_API_KEY', 're_live');
    const after = await sendReminderToRegistrants(event);
    expect(after).toMatchObject({ sent: 2, failed: 0, gaveUp: 0 });
    expect(mockSendReal).toHaveBeenCalledTimes(2);
  });

  it('refuses a manual send the same way, so the operator is told the cause', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');

    const r = await sendReminderToRegistrants(event, { manual: true });
    expect(r.error).toMatch(/not configured/i);
    expect(rows).toHaveLength(0);
  });

  it('leaves the dev stub path alone outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', '');

    const r = await sendReminderToRegistrants(event);
    expect(r).toMatchObject({ queued: 2, failed: 0 });
    expect(r.error).toBeUndefined();
  });
});
