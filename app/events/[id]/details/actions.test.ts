import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it as a no-op for these tests.
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => ({ id: 's-1', email: 'a@b.com', role: 'organizer' })),
}));

// next/cache's revalidatePath must be mocked: it's a no-op in the test runner
// but we want to assert it's called with the right paths so the page + dashboard
// re-render with the updated registration_close_at value.
const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
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
// What the update().eq().select().maybeSingle() chain returns. `null` simulates
// RLS-blocked write (0 rows matched the .eq filter, no error surfaced).
let mockUpdatedRow: { id: string } | null = { id: eventId };

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
          eq: (_col: string, _val: string) => ({
            select: (_cols: string) => ({
              maybeSingle: async () => ({ data: mockUpdatedRow, error: mockUpdateError }),
            }),
          }),
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
  mockUpdatedRow = { id: eventId };
  revalidatePathMock.mockClear();
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

  it('revalidates /events/[id]/details and /dashboard after a successful save', async () => {
    // Without revalidation the Server Component keeps the stale `current`
    // prop, which breaks the RegistrationCloseEditor's `dirty` flag (Saved.
    // never renders) AND leaves the page's lifecycle pill / action toolbar
    // showing the wrong state until a full reload.
    const result = await updateRegistrationClose(eventId, '2026-06-15T08:00:00.000Z');
    expect(result).toEqual({});
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/details`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT revalidate when the update fails (error path)', async () => {
    mockUpdatedRow = null;
    const result = await updateRegistrationClose(eventId, '2026-06-15T08:00:00.000Z');
    expect(result.error).toBeDefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns error when update is silently blocked by RLS (0 rows affected)', async () => {
    // RLS scenario: manager-role staff calling update on an event they don't
    // own. Supabase returns { data: null, error: null } because no rows match
    // the .eq filter under the RLS policy. Without the explicit guard, the
    // action would return {} (success) but the DB row would be unchanged —
    // CLAUDE.md rule 12 violation. The guard surfaces this as an error.
    mockUpdatedRow = null;
    const result = await updateRegistrationClose(
      eventId,
      '2026-06-15T08:00:00.000Z',
    );
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not found|not owned/i);
    // The update payload was still sent (we can't detect RLS pre-flight),
    // but the post-update guard catches the empty result.
    expect(lastUpdate).toEqual({
      registration_close_at: new Date('2026-06-15T08:00:00.000Z').toISOString(),
    });
  });
});
