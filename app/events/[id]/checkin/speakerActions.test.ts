import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it to return a fixed staff row
// so we can assert updated_by stamping. Per the details/actions.test.ts pattern.
const requireStaffMock = vi.fn(async () => ({
  id: 's-1',
  email: 'a@b.com',
  role: 'organiser_member' as StaffRole,
  organisation_id: 'org-1' as string | null,
}));
// canCheckIn stays the real helper: the role gate is what these tests pin.
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireStaff: () => requireStaffMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

type StaffRole = import('@/lib/auth').Staff['role'];
const eventId = '11111111-2222-4333-8444-555555555555';

// Every .eq() call across all stubs, in call order, so a test can assert the
// filter columns/values are not swapped (asserted once, in the happy-path
// insert test).
let eqCalls: Array<[string, unknown]> = [];

// ---- mock state -----------------------------------------------------------
// events read: .select().eq().maybeSingle() (kept out of eqCalls: it is not part of the speaker filters)
type MockEvent = {
  status: string;
  deleted_at: string | null;
  start_time: string;
  end_time: string;
  registration_close_at: string | null;
  registration_open_at: string | null;
  organisation_id: string;
  created_by: string;
};
// Inside the check-in window by default: started 30 minutes ago, ends in 3 hours.
const HOUR = 3_600_000;
const eventAt = (startOffsetMs: number, endOffsetMs: number, over: Partial<MockEvent> = {}): MockEvent => ({
  status: 'published',
  deleted_at: null,
  start_time: new Date(Date.now() + startOffsetMs).toISOString(),
  end_time: new Date(Date.now() + endOffsetMs).toISOString(),
  registration_close_at: null,
  registration_open_at: null,
  organisation_id: 'org-1',
  created_by: 's-1',
  ...over,
});
const liveEvent = (over: Partial<MockEvent> = {}) => eventAt(-HOUR / 2, 3 * HOUR, over);
let mockEvent: MockEvent | null = liveEvent();

// agenda_blocks read: await supabase.from('agenda_blocks').select(...).eq(...)
type BlockRow = { host: string | null; topics: unknown };
let mockBlocks: BlockRow[] | null = [
  { host: 'Ada Lovelace', topics: [{ title: 'T', speaker_name: 'Grace Hopper' }] },
];
let mockBlocksError: { message: string } | null = null;

// speaker_checkins existing-row read: .select().eq().eq().maybeSingle()
let mockExistingRow: { id: string; checked_in_at: string | null } | null = null;
let mockExistingError: { message: string } | null = null;

// insert(...).select().maybeSingle()
let lastInsert: Record<string, unknown> | null = null;
let mockInsertedRow: { id: string; checked_in_at: string | null } | null = null;
let mockInsertError: { message: string; code?: string } | null = null;

// update(...).eq().select().maybeSingle()
let lastUpdate: Record<string, unknown> | null = null;
let mockUpdatedRow: { id: string; checked_in_at: string | null } | null = null;
let mockUpdateError: { message: string; code?: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: (_cols: string) => ({
            eq: () => ({ maybeSingle: async () => ({ data: mockEvent, error: null }) }),
          }),
        };
      }
      if (table === 'agenda_blocks') {
        return {
          select: (_cols: string) => ({
            eq: async (col: string, val: string) => {
              eqCalls.push([col, val]);
              return {
                data: mockBlocks,
                error: mockBlocksError,
              };
            },
          }),
        };
      }
      if (table === 'speaker_checkins') {
        return {
          select: (_cols: string) => ({
            eq: (c1: string, v1: string) => {
              eqCalls.push([c1, v1]);
              return {
                eq: (c2: string, v2: string) => {
                  eqCalls.push([c2, v2]);
                  return {
                    maybeSingle: async () => ({
                      data: mockExistingRow,
                      error: mockExistingError,
                    }),
                  };
                },
              };
            },
          }),
          insert: (payload: Record<string, unknown>) => {
            lastInsert = payload;
            return {
              select: (_cols: string) => ({
                maybeSingle: async () => ({
                  data: mockInsertedRow,
                  error: mockInsertError,
                }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            lastUpdate = payload;
            return {
              eq: (col: string, val: string) => {
                eqCalls.push([col, val]);
                return {
                  select: (_cols: string) => ({
                    maybeSingle: async () => ({
                      data: mockUpdatedRow,
                      error: mockUpdateError,
                    }),
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { toggleSpeakerCheckin } from './speakerActions';
import { NOT_EVENT_WRITER, CHECKIN_ROLE_MESSAGE } from '@/lib/lifecycle/eventLifecycle';
import { NotAuthorizedError } from '@/lib/auth';

beforeEach(() => {
  requireStaffMock.mockClear();
  revalidatePathMock.mockClear();
  mockBlocks = [
    { host: 'Ada Lovelace', topics: [{ title: 'T', speaker_name: 'Grace Hopper' }] },
  ];
  mockBlocksError = null;
  mockEvent = liveEvent();
  eqCalls = [];
  mockExistingRow = null;
  mockExistingError = null;
  lastInsert = null;
  mockInsertedRow = { id: 'sc-1', checked_in_at: '2026-06-13T10:00:00.000Z' };
  mockInsertError = null;
  lastUpdate = null;
  mockUpdatedRow = { id: 'sc-1', checked_in_at: null };
  mockUpdateError = null;
});

describe('toggleSpeakerCheckin', () => {
  it('inserts a checked-in row when no row exists for the speaker', async () => {
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toMatchObject({ ok: true });
    expect(lastInsert).not.toBeNull();
    expect(lastInsert).toMatchObject({
      event_id: eventId,
      speaker_name: 'Ada Lovelace',
      updated_by: 's-1',
    });
    expect(typeof lastInsert!.checked_in_at).toBe('string');
    expect(new Date(lastInsert!.checked_in_at as string).getTime()).not.toBeNaN();
    expect(lastUpdate).toBeNull();
    // Filter args, in order: agenda_blocks read, then the existing-row read.
    expect(eqCalls).toEqual([
      ['event_id', eventId],
      ['event_id', eventId],
      ['speaker_name', 'Ada Lovelace'],
    ]);
  });

  it('sets checked_in_at when an existing row is currently cleared (null)', async () => {
    mockExistingRow = { id: 'sc-1', checked_in_at: null };
    mockUpdatedRow = { id: 'sc-1', checked_in_at: '2026-06-13T10:00:00.000Z' };
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toMatchObject({ ok: true });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).not.toBeNull();
    expect(typeof lastUpdate!.checked_in_at).toBe('string');
    expect(lastUpdate!.updated_by).toBe('s-1');
  });

  it('clears checked_in_at to null when currently checked in (toggle off)', async () => {
    mockExistingRow = { id: 'sc-1', checked_in_at: '2026-06-13T09:00:00.000Z' };
    mockUpdatedRow = { id: 'sc-1', checked_in_at: null };
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toMatchObject({ ok: true, checkedInAt: null });
    expect(lastUpdate).toMatchObject({ checked_in_at: null, updated_by: 's-1' });
  });

  it('matches topic speaker names too, and trims the incoming name', async () => {
    const result = await toggleSpeakerCheckin(eventId, '  Grace Hopper  ');
    expect(result).toMatchObject({ ok: true });
    expect(lastInsert).toMatchObject({ speaker_name: 'Grace Hopper' });
  });

  it('rejects a name that is not on the agenda, without writing', async () => {
    const result = await toggleSpeakerCheckin(eventId, 'Random Person');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/agenda|speaker/i);
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input (empty name, overlong name, bad event id) without writing', async () => {
    const r1 = await toggleSpeakerCheckin(eventId, '   ');
    expect(r1).toHaveProperty('error');
    const r2 = await toggleSpeakerCheckin(eventId, 'x'.repeat(121));
    expect(r2).toHaveProperty('error');
    const r3 = await toggleSpeakerCheckin('not-a-uuid', 'Ada Lovelace');
    expect(r3).toHaveProperty('error');
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
  });

  it('returns error when the agenda read yields no blocks (unknown or unowned event)', async () => {
    // RLS-filtered read: an organizer who does not own the event sees zero
    // agenda_blocks rows, so every name is "not on the agenda" — info-hiding
    // identical to the markAttended fallback.
    mockBlocks = [];
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toHaveProperty('error');
    expect(lastInsert).toBeNull();
  });

  it('throws when the agenda read fails (unexpected DB error)', async () => {
    mockBlocks = null;
    mockBlocksError = { message: 'boom' };
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toMatchObject({
      message: 'boom',
    });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('throws when the existing-row read fails (unexpected DB error)', async () => {
    mockExistingError = { message: 'read boom' };
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toMatchObject({
      message: 'read boom',
    });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('throws on a generic (non-23505) insert failure', async () => {
    mockInsertedRow = null;
    mockInsertError = { message: 'insert boom' };
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toMatchObject({
      message: 'insert boom',
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('throws on an update failure', async () => {
    mockExistingRow = { id: 'sc-1', checked_in_at: null };
    mockUpdatedRow = null;
    mockUpdateError = { message: 'update boom' };
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toMatchObject({
      message: 'update boom',
    });
    expect(lastInsert).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('Q18: returns structured error when the UPDATE silently affects zero rows', async () => {
    mockExistingRow = { id: 'sc-1', checked_in_at: null };
    mockUpdatedRow = null; // RLS-blocked write: { data: null, error: null }
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toHaveProperty('error');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('Q18: returns structured error when the INSERT returns no row', async () => {
    mockInsertedRow = null;
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toHaveProperty('error');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces a concurrent-toggle unique violation as a structured error', async () => {
    mockInsertedRow = null;
    mockInsertError = { message: 'duplicate key', code: '23505' };
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toHaveProperty('error');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('revalidates the checkin and details pages exactly once each on success', async () => {
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toMatchObject({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/checkin`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/details`);
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
  });

  it('propagates requireStaff rejection before any DB work', async () => {
    requireStaffMock.mockRejectedValueOnce(new Error('not authorized'));
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toThrow(
      /not authorized/,
    );
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
  });

  // Backtest M1: the desk tells body_admin and auditor it is read-only, but this action wrote for them.
  it.each(['body_admin', 'auditor'] as const)('refuses %s before any read or write, with the desk role sentence', async (role) => {
    requireStaffMock.mockResolvedValueOnce({ id: 's-9', email: 'x@y.com', role, organisation_id: 'org-1' });
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: CHECKIN_ROLE_MESSAGE });
    expect(eqCalls).toEqual([]);
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  // Q51 (Ivan, 2026-11-07): a member acts only on events it created.
  it('refuses an organiser_member on a colleague\'s event, without writing', async () => {
    requireStaffMock.mockResolvedValueOnce({ id: 's-2', email: 'x@y.com', role: 'organiser_member', organisation_id: 'org-1' });
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: NOT_EVENT_WRITER });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
  });

  it.each(['organiser_admin', 'eventar_staff'] as const)('still lets %s toggle', async (role) => {
    requireStaffMock.mockResolvedValueOnce({ id: 's-9', email: 'x@y.com', role, organisation_id: 'org-1' });
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toMatchObject({ ok: true });
    expect(lastInsert).not.toBeNull();
  });

  // Backtest M1/m3: another organisation's staff who know a real speaker name hit the RLS policy (42501) and got an
  // HTTP 500. A refusal is a sentence.
  it('turns an RLS refusal (42501) on the insert into a plain sentence instead of a throw', async () => {
    mockInsertedRow = null;
    mockInsertError = { message: 'new row violates row-level security policy', code: '42501' };
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: 'You do not have access to this event.' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('turns an RLS refusal (42501) on the update into a plain sentence instead of a throw', async () => {
    mockExistingRow = { id: 'sc-1', checked_in_at: null };
    mockUpdatedRow = null;
    mockUpdateError = { message: 'denied', code: '42501' };
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: 'You do not have access to this event.' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// Acceptance walk dev m5.
describe('toggleSpeakerCheckin: signed-out session and event state', () => {
  it('answers a server-side sign-out with the door message instead of throwing', async () => {
    requireStaffMock.mockRejectedValueOnce(new NotAuthorizedError());
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: "You've been signed out. This check-in was not saved. Log in again to continue." });
    expect(lastInsert).toBeNull();
  });

  it('still throws any other auth failure', async () => {
    requireStaffMock.mockRejectedValueOnce(new Error('boom'));
    await expect(toggleSpeakerCheckin(eventId, 'Ada Lovelace')).rejects.toThrow('boom');
  });

  it.each([
    [liveEvent({ status: 'draft' }), 'Publish the event before checking people in.'],
    [liveEvent({ status: 'cancelled' }), 'This event was cancelled. Check-in is closed.'],
    [liveEvent({ deleted_at: '2026-10-01T00:00:00Z' }), 'This event was deleted. Check-in is closed.'],
  ])('refuses %j without writing', async (event, message) => {
    mockEvent = event;
    const result = await toggleSpeakerCheckin(eventId, 'Ada Lovelace');
    expect(result).toEqual({ error: message });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('says the event is not found or not in the organisation when RLS hides it, and when a write is refused', async () => {
    mockEvent = null;
    expect(await toggleSpeakerCheckin(eventId, 'Ada Lovelace')).toEqual({ error: 'Check-in failed — event not found or not in your organisation.' });
    mockEvent = liveEvent();
    mockInsertedRow = null;
    expect(await toggleSpeakerCheckin(eventId, 'Ada Lovelace')).toEqual({ error: 'Check-in failed — event not found or not in your organisation.' });
  });
});

// Ivan 2026-11-04 (Decide 2, option A): speakers are ticked in the same window as attendees, [start - 60 min, end].
describe('toggleSpeakerCheckin: the check-in window', () => {
  const NOT_OPEN = 'Check-in has not opened yet. It opens 60 minutes before the event starts.';
  const CLOSED = 'Check-in is closed. This event has ended.';

  it.each([
    ['31 days early', eventAt(31 * 24 * HOUR, 31 * 24 * HOUR + 3 * HOUR), NOT_OPEN],
    ['61 minutes before the start', eventAt(61 * 60_000, 61 * 60_000 + 3 * HOUR), NOT_OPEN],
    ['after the end', eventAt(-5 * HOUR, -HOUR), CLOSED],
    ['a completed event', liveEvent({ status: 'completed' }), CLOSED],
  ])('refuses %s without writing', async (_label, event, message) => {
    mockEvent = event;
    expect(await toggleSpeakerCheckin(eventId, 'Ada Lovelace')).toEqual({ error: message });
    expect(lastInsert).toBeNull();
    expect(lastUpdate).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refusal covers un-ticking too: a ticked speaker cannot be cleared outside the window', async () => {
    mockEvent = eventAt(-5 * HOUR, -HOUR);
    mockExistingRow = { id: 'sc-1', checked_in_at: '2026-06-13T10:00:00.000Z' };
    expect(await toggleSpeakerCheckin(eventId, 'Ada Lovelace')).toEqual({ error: CLOSED });
    expect(lastUpdate).toBeNull();
  });

  it('accepts 59 minutes before the start (inside the 60-minute pre-open)', async () => {
    mockEvent = eventAt(59 * 60_000, 59 * 60_000 + 3 * HOUR);
    expect(await toggleSpeakerCheckin(eventId, 'Ada Lovelace')).toMatchObject({ ok: true });
    expect(lastInsert).not.toBeNull();
  });
});
