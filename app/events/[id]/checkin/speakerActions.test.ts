import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it to return a fixed staff row
// so we can assert updated_by stamping. Per the details/actions.test.ts pattern.
const requireStaffMock = vi.fn(async () => ({
  id: 's-1',
  email: 'a@b.com',
  role: 'organizer' as const,
}));
vi.mock('@/lib/auth', () => ({
  requireStaff: () => requireStaffMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

const eventId = '11111111-2222-4333-8444-555555555555';

// Every .eq() call across all stubs, in call order, so a test can assert the
// filter columns/values are not swapped (asserted once, in the happy-path
// insert test).
let eqCalls: Array<[string, unknown]> = [];

// ---- mock state -----------------------------------------------------------
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
let mockUpdateError: { message: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    from: (table: string) => {
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

beforeEach(() => {
  requireStaffMock.mockClear();
  revalidatePathMock.mockClear();
  mockBlocks = [
    { host: 'Ada Lovelace', topics: [{ title: 'T', speaker_name: 'Grace Hopper' }] },
  ];
  mockBlocksError = null;
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
});
