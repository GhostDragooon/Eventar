import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Rate limit: allow by default (same pattern as the registration action tests).
vi.mock('@/lib/rateLimit', () => ({
  rateLimitByIp: vi.fn(async () => ({ allowed: true, remaining: 9, resetAt: new Date() })),
}));

// next/cache revalidatePath: no-op.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Code-format gate: always pass — these tests target the Q2 block-ownership
// behaviour, not the bearer-token format check.
vi.mock('@/lib/registrationCode', () => ({
  isValidRegistrationCode: vi.fn(() => true),
}));

// --- Supabase admin mock ---
//
// Tables the action touches: registrations (eligibility lookup),
// agenda_blocks (Q2 ownership check), survey_responses (insert).
// Mutable per-test state (reset in beforeEach):
const eventId = '11111111-2222-4333-8444-555555555555';
const otherEventId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const blockId = '22222222-3333-4444-8555-666666666666';
const regId = '77777777-bbbb-4ccc-8ddd-eeeeeeeeeeee';

type RegRow = {
  id: string;
  status: string;
  events: { id: string; status: string } | null;
};
let mockRegRow: RegRow | null = null;
let mockBlockRow: { id: string; event_id: string } | null = null;
let lastSurveyInsert: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'registrations') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: mockRegRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'agenda_blocks') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: mockBlockRow && mockBlockRow.id === val ? mockBlockRow : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'survey_responses') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            lastSurveyInsert = payload;
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

import { beforeEach, describe, it, expect } from 'vitest';
import { submitSurvey } from './actions';

describe('submitSurvey — Q2 valuable_session (G1)', () => {
  beforeEach(() => {
    mockRegRow = { id: regId, status: 'attended', events: { id: eventId, status: 'published' } };
    mockBlockRow = { id: blockId, event_id: eventId };
    lastSurveyInsert = null;
  });

  it('writes valuable_block_id when the block belongs to the registration event', async () => {
    const res = await submitSurvey('WK-ABCDEF', { valuable_session: blockId });

    expect(res).toEqual({ ok: true });
    expect(lastSurveyInsert).toMatchObject({
      registration_id: regId,
      event_id: eventId,
      valuable_block_id: blockId,
      valuable_overall: false,
    });
    expect(lastSurveyInsert).not.toHaveProperty('key_highlights');
  });

  it('rejects a block id that belongs to a different event — no insert', async () => {
    mockBlockRow = { id: blockId, event_id: otherEventId };

    const res = await submitSurvey('WK-ABCDEF', { valuable_session: blockId });

    expect(res).toEqual({ error: 'That session is not part of this event. Please review and resubmit.' });
    expect(lastSurveyInsert).toBeNull();
  });

  it('rejects a block id that does not exist — no insert', async () => {
    mockBlockRow = null;

    const res = await submitSurvey('WK-ABCDEF', { valuable_session: blockId });

    expect(res).toEqual({ error: 'That session is not part of this event. Please review and resubmit.' });
    expect(lastSurveyInsert).toBeNull();
  });

  it("writes valuable_overall=true with a null block for 'general'", async () => {
    const res = await submitSurvey('WK-ABCDEF', { valuable_session: 'general' });

    expect(res).toEqual({ ok: true });
    expect(lastSurveyInsert).toMatchObject({
      valuable_block_id: null,
      valuable_overall: true,
    });
  });

  it('writes null/false when the question is unanswered', async () => {
    const res = await submitSurvey('WK-ABCDEF', {});

    expect(res).toEqual({ ok: true });
    expect(lastSurveyInsert?.valuable_block_id).toBeNull();
    expect(lastSurveyInsert?.valuable_overall).toBe(false);
  });
});
