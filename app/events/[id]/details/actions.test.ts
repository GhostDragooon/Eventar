import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it as a no-op for these tests.
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => ({ id: 's-1', email: 'a@b.com', role: 'organizer' })),
}));

// Per the auth.test.ts pattern: fabricate a minimal supabase client shape
// that updateRegistrationClose depends on. The action calls
// supabase.from('events').select('id, start_time').eq().maybeSingle() then,
// on the happy path, supabase.from('events').update(...).eq().
const eventStartTime = '2026-06-15T09:00:00.000Z';
const eventId = '11111111-2222-4333-8444-555555555555';

let lastUpdate: Record<string, unknown> | null = null;
let mockEventRow: { id: string; start_time: string } | null = {
  id: eventId,
  start_time: eventStartTime,
};
let mockReadError: { message: string } | null = null;
let mockUpdateError: { message: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => ({ data: mockEventRow, error: mockReadError }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        lastUpdate = payload;
        return {
          eq: (_col: string, _val: string) =>
            Promise.resolve({ error: mockUpdateError }),
        };
      },
    }),
  })),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { updateRegistrationClose } from './actions';

beforeEach(() => {
  lastUpdate = null;
  mockEventRow = { id: eventId, start_time: eventStartTime };
  mockReadError = null;
  mockUpdateError = null;
});

describe('updateRegistrationClose', () => {
  it('succeeds when clearing the close timestamp (null)', async () => {
    const result = await updateRegistrationClose(eventId, null);
    expect(result).toEqual({});
    expect(lastUpdate).toEqual({ registration_close_at: null });
  });

  it('succeeds when close is before event start', async () => {
    const before = '2026-06-15T08:00:00.000Z';
    const result = await updateRegistrationClose(eventId, before);
    expect(result).toEqual({});
    expect(lastUpdate).toEqual({
      registration_close_at: new Date(before).toISOString(),
    });
  });

  it('returns error when close is at or after event start', async () => {
    const atStart = eventStartTime;
    const r1 = await updateRegistrationClose(eventId, atStart);
    expect(r1.error).toBeDefined();
    expect(r1.error).toMatch(/before event start/i);
    expect(lastUpdate).toBeNull();

    const after = '2026-06-15T10:00:00.000Z';
    const r2 = await updateRegistrationClose(eventId, after);
    expect(r2.error).toBeDefined();
    expect(r2.error).toMatch(/before event start/i);
    expect(lastUpdate).toBeNull();
  });

  it('returns error when timestamp is malformed', async () => {
    const result = await updateRegistrationClose(eventId, 'not-a-date');
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/invalid/i);
    expect(lastUpdate).toBeNull();
  });

  it('returns error when event row does not exist', async () => {
    mockEventRow = null;
    const result = await updateRegistrationClose(
      eventId,
      '2026-06-15T08:00:00.000Z',
    );
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not found/i);
    expect(lastUpdate).toBeNull();
  });
});
