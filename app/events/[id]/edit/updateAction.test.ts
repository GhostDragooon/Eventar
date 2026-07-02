import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it per the speakerActions.test.ts
// pattern so we can assert it runs (and propagates rejection) first.
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

// ---- mock supabase ----------------------------------------------------------
// updateEvent talks to the DB exclusively through the update_event_with_blocks
// RPC, so the mock only needs .rpc(). Every call is recorded for assertions.
let rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
let mockRpcResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      return mockRpcResult;
    },
  })),
}));

// The in-code owner gate reads events.created_by via admin before the RPC
// (service-role contexts skip the RPC's own JWT-based check). Default: the
// mocked staff (s-1) owns the event; tests can flip mockOwnerId.
let mockOwnerId: string | null = 's-1';
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => ({
            data: mockOwnerId == null ? null : { created_by: mockOwnerId },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { updateEvent } from './updateAction';

const eventId = '11111111-2222-4333-8444-555555555555';

// Menlo Park — tzFromCoords (pure tz-lookup, deliberately NOT mocked) resolves
// these coordinates to America/Los_Angeles, so the test pins the real derived
// value rather than a mock echo.
const validEvent = {
  title: 'Internal Workshop',
  topic: 'Testing',
  description: 'A test event',
  start_time: '2026-06-15T09:00:00.000Z',
  end_time: '2026-06-15T16:00:00.000Z',
  venue_name: 'Rosewood Sand Hill',
  venue_address: '2825 Sand Hill Rd',
  city: 'Menlo Park',
  region: 'California',
  country: 'United States',
  latitude: 37.4123,
  longitude: -122.2007,
  max_attendees: 120,
};

const validBlock = {
  start_time: '2026-06-15T09:00:00.000Z',
  end_time: '2026-06-15T10:00:00.000Z',
  kind: 'workshop' as const,
  title: 'Intro',
  topics: [
    {
      title: 'Why test-first?',
      speaker_name: 'Jane Doe',
      speaker_credential: 'Sr. Engineer',
      speaker_affiliation: 'Acme Co',
    },
  ],
};

beforeEach(() => {
  mockOwnerId = 's-1';
  requireStaffMock.mockClear();
  revalidatePathMock.mockClear();
  rpcCalls = [];
  mockRpcResult = { data: eventId, error: null };
});

describe('updateEvent', () => {
  it('returns field errors and does not call the RPC on an invalid event payload', async () => {
    const result = await updateEvent(eventId, {
      event: { ...validEvent, title: '' },
      blocks: [validBlock],
    });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/title/);
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns block-prefixed field errors and does not call the RPC on an invalid block', async () => {
    const badBlock = { ...validBlock, end_time: '2026-06-15T08:00:00.000Z' };
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [badBlock],
    });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/block/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects a non-uuid event id without calling the RPC', async () => {
    const result = await updateEvent('not-a-uuid', {
      event: validEvent,
      blocks: [validBlock],
    });
    expect(result).toHaveProperty('error');
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects a block that runs outside the event envelope', async () => {
    const outside = { ...validBlock, end_time: '2026-06-15T17:00:00.000Z' };
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [outside],
    });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/window/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects a non-array blocks payload instead of silently wiping the agenda', async () => {
    // Full-replace semantics: coercing a malformed blocks payload to [] (the
    // create action's behavior) would delete every agenda block here. Rule 12:
    // reject, never silently destroy.
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: undefined,
    });
    expect(result).toHaveProperty('error');
    expect(rpcCalls).toHaveLength(0);
  });

  it('calls the RPC with named params, derived timezone, complete payload, and no status key', async () => {
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [validBlock],
    });
    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('update_event_with_blocks');

    const params = rpcCalls[0].params;
    expect(params.event_id_input).toBe(eventId);

    const eventInput = params.event_input as Record<string, unknown>;
    // Timezone derived server-side from the submitted coordinates — the form
    // sends no timezone control, and a stale client value must never win.
    expect(eventInput.timezone).toBe('America/Los_Angeles');
    // Absent status keeps the DB value (per the RPC contract); the edit form
    // does not manage lifecycle, so the action must never send the key.
    expect(eventInput).not.toHaveProperty('status');
    // Complete payload — absent nullable keys would overwrite to NULL.
    expect(eventInput).toMatchObject({
      title: 'Internal Workshop',
      topic: 'Testing',
      description: 'A test event',
      start_time: '2026-06-15T09:00:00.000Z',
      end_time: '2026-06-15T16:00:00.000Z',
      venue_name: 'Rosewood Sand Hill',
      venue_address: '2825 Sand Hill Rd',
      city: 'Menlo Park',
      region: 'California',
      country: 'United States',
      latitude: 37.4123,
      longitude: -122.2007,
      max_attendees: 120,
    });

    const blocksInput = params.blocks_input as Array<Record<string, unknown>>;
    expect(Array.isArray(blocksInput)).toBe(true);
    expect(blocksInput).toHaveLength(1);
    // Zod defaults fill the optional keys, so the jsonb payload is complete.
    expect(blocksInput[0]).toMatchObject({
      start_time: '2026-06-15T09:00:00.000Z',
      end_time: '2026-06-15T10:00:00.000Z',
      kind: 'workshop',
      title: 'Intro',
      host: '',
      notes: '',
      display_order: 0,
    });
  });

  it('sends an empty array (never null) when the event has no blocks', async () => {
    const result = await updateEvent(eventId, { event: validEvent, blocks: [] });
    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].params.blocks_input).toEqual([]);
  });

  it('surfaces an RPC error (non-owner raise) as a structured error without revalidating', async () => {
    mockRpcResult = {
      data: null,
      error: { message: `not the owner of event ${eventId}` },
    };
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [validBlock],
    });
    expect(result).toEqual({ error: `not the owner of event ${eventId}` });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns an error when the RPC yields no id (no silent success)', async () => {
    mockRpcResult = { data: null, error: null };
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [validBlock],
    });
    expect(result).toHaveProperty('error');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('revalidates event, edit, details, and dashboard paths on success', async () => {
    const result = await updateEvent(eventId, {
      event: validEvent,
      blocks: [validBlock],
    });
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/edit`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/details`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
  });

  it('propagates requireStaff rejection before validation or RPC work', async () => {
    requireStaffMock.mockRejectedValueOnce(new Error('not authorized'));
    await expect(
      updateEvent(eventId, { event: validEvent, blocks: [validBlock] }),
    ).rejects.toThrow(/not authorized/);
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
