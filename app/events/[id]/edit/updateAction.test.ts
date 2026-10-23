import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// requireStaff is gated by hard rule #3; mock it per the speakerActions.test.ts
// pattern so we can assert it runs (and propagates rejection) first.
const requireStaffMock = vi.fn(async () => ({
  id: 's-1',
  email: 'a@b.com',
  role: 'organizer' as string,
  organisation_id: 'org-1' as string | null,
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

// The in-code gate reads events.organisation_id and status via admin before the RPC
// (service-role contexts skip the RPC's own JWT-based check). Default: a draft in the
// mocked staff's organisation; tests flip mockEvent (null = no such event).
let mockEvent: { organisation_id: string; status: string; deleted_at: string | null } | null = { organisation_id: 'org-1', status: 'draft', deleted_at: null };
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: (_table: string) => ({
      // Honours the column list, like PostgREST: a select that drops `status` or `organisation_id` returns
      // objects without them, so the gates see `undefined` and the tests below fail instead of passing blind.
      select: (cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => {
            if (mockEvent == null) return { data: null, error: null };
            const wanted = cols.split(',').map((c) => c.trim());
            const projected = Object.fromEntries(Object.entries(mockEvent).filter(([k]) => wanted.includes(k)));
            return { data: projected, error: null };
          },
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
  mockEvent = { organisation_id: 'org-1', status: 'draft', deleted_at: null };
  requireStaffMock.mockClear();
  revalidatePathMock.mockClear();
  rpcCalls = [];
  mockRpcResult = { data: eventId, error: null };
});

describe('updateEvent', () => {
  // Ivan's ruling 2026-10-23: the screens already say "Details cannot be edited after publishing yet", but the
  // server accepted an update to a published event from any colleague (and wrote no audit row). Gate it until P9b.
  it.each(['published', 'cancelled', 'completed'])('refuses an event whose status is %s without calling the RPC', async (status) => {
    mockEvent = { organisation_id: 'org-1', status, deleted_at: null };
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ error: expect.stringMatching(/no longer a draft/i) });
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refuses every role on a published event, the platform operator included', async () => {
    mockEvent = { organisation_id: 'org-1', status: 'published', deleted_at: null };
    requireStaffMock.mockResolvedValueOnce({ id: 's-9', email: 'op@x.com', role: 'eventar_staff', organisation_id: 'org-other' });
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ error: expect.stringMatching(/no longer a draft/i) });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses another organisation's event before saying anything about its status", async () => {
    mockEvent = { organisation_id: 'org-2', status: 'published', deleted_at: null };
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ error: 'You do not have access to this event.' });
    expect(rpcCalls).toHaveLength(0);
  });

  // The action lets the operator through; the live RPC then refuses an eventar_staff caller from another
  // organisation ("not in the same organisation", backtest F3, pre-existing, DB-04's to settle). This test
  // pins the action's own gate only: the RPC is mocked.
  it("lets the platform operator past the action's own gate on another organisation's draft", async () => {
    mockEvent = { organisation_id: 'org-2', status: 'draft', deleted_at: null };
    requireStaffMock.mockResolvedValueOnce({ id: 's-9', email: 'op@x.com', role: 'eventar_staff', organisation_id: 'org-other' });
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(1);
  });

  it('treats a soft-deleted draft as not found (the backtest saved one)', async () => {
    mockEvent = { organisation_id: 'org-1', status: 'draft', deleted_at: '2026-10-01T00:00:00.000Z' };
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ error: 'Event not found.' });
    expect(rpcCalls).toHaveLength(0);
  });

  it('says so when the event does not exist', async () => {
    mockEvent = null;
    const result = await updateEvent(eventId, { event: validEvent, blocks: [validBlock] });
    expect(result).toEqual({ error: 'Event not found.' });
    expect(rpcCalls).toHaveLength(0);
  });

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

  it('forwards an enabled self-serve check-in mode to the RPC', async () => {
    const result = await updateEvent(eventId, {
      event: { ...validEvent, checkin_modes: { staff: true, self_serve: true } },
      blocks: [],
    });
    expect(result).toEqual({ ok: true });
    const eventInput = rpcCalls[0].params.event_input as Record<string, unknown>;
    expect(eventInput.checkin_modes).toEqual({ staff: true, self_serve: true });
  });

  it('sends the staff-only default when the payload omits checkin_modes', async () => {
    // Zod fills it, so event_input always carries the key. That matters because
    // this RPC is full-replace: a missing key would land as SQL NULL on a NOT
    // NULL column. The RPC coalesces to the current value as a second guard.
    const result = await updateEvent(eventId, { event: validEvent, blocks: [] });
    expect(result).toEqual({ ok: true });
    const eventInput = rpcCalls[0].params.event_input as Record<string, unknown>;
    expect(eventInput.checkin_modes).toEqual({ staff: true, self_serve: false });
  });

  it('rejects a malformed checkin_modes without calling the RPC', async () => {
    const result = await updateEvent(eventId, {
      event: { ...validEvent, checkin_modes: { staff: true, self_serve: 'yes' } },
      blocks: [],
    });
    expect(result).not.toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(0);
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
