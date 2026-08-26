import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// The action's collaborators, all stubbed: this file tests ONE thing — that
// each self_check_in result code reaches the attendee as the right sentence.
// The codes themselves are exercised against the real function in
// tests/rls/self_check_in.rls.test.ts.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ rpc }) }));
vi.mock('@/lib/rateLimit', () => ({ getClientIp: vi.fn(async () => '203.0.113.1') }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const { award } = vi.hoisted(() => ({
  award: vi.fn(
    async () => [] as { bodyId: string | null; status: string; reason?: string }[],
  ),
}));
vi.mock('@/lib/cpd/awardAttendanceCredit', () => ({ awardAttendanceCredit: award }));

import { describe, expect, it, beforeEach } from 'vitest';
import { selfCheckIn } from './actions';

const CODE = 'WK-HBQWDR';
const EVENT = '11111111-1111-1111-1111-111111111111';

function resolvesTo(result: string) {
  rpc.mockResolvedValueOnce({ data: [{ result, event_id: EVENT }], error: null });
}

beforeEach(() => {
  rpc.mockReset();
  award.mockReset();
  // Default: no CPD groups on the event ("not_cpd") → credit is silent
  // (no `credit` key on the response). Individual tests override.
  award.mockResolvedValue([{ bodyId: null, status: 'skipped', reason: 'not_cpd' }]);
});

describe('selfCheckIn — result code to attendee copy', () => {
  it('checks in on ok, and stays silent when the event has no accreditation', async () => {
    resolvesTo('ok');
    const res = await selfCheckIn(CODE);
    // The check-in itself succeeds and the award call fires — but a non-CPD
    // event produces no `credit` key at all (silence is correct).
    expect(res).toEqual({ ok: true, eventId: EVENT, credit: undefined });
    expect(award).toHaveBeenCalledOnce();
  });

  it('reports credit posted when at least one body issued', async () => {
    resolvesTo('ok');
    award.mockResolvedValueOnce([{ bodyId: 'body-1', status: 'issued' }]);
    const res = await selfCheckIn(CODE);
    expect(res).toEqual({
      ok: true,
      eventId: EVENT,
      credit: { kind: 'posted' },
    });
  });

  it('reports credit posted on "already" (idempotent re-check)', async () => {
    resolvesTo('ok');
    award.mockResolvedValueOnce([{ bodyId: 'body-1', status: 'already' }]);
    const res = await selfCheckIn(CODE);
    expect(res).toEqual({
      ok: true,
      eventId: EVENT,
      credit: { kind: 'posted' },
    });
  });

  // Rule 12 — a checked-in attendee whose category-coded group has no mapping
  // must not be silently told "You're checked in" and nothing else.
  it('surfaces a missing credit when the only body skipped for a non-not_cpd reason', async () => {
    resolvesTo('ok');
    award.mockResolvedValueOnce([{ bodyId: 'body-1', status: 'skipped', reason: 'no_role_match' }]);
    const res = await selfCheckIn(CODE);
    expect(res).toEqual({
      ok: true,
      eventId: EVENT,
      credit: { kind: 'missing' },
    });
  });

  it('surfaces a missing credit when the award threw', async () => {
    resolvesTo('ok');
    award.mockRejectedValueOnce(new Error('boom'));
    const res = await selfCheckIn(CODE);
    // Attendance is still authoritative — ok:true. The failure is a `missing`
    // signal to the attendee, not an error branch.
    expect(res).toEqual({
      ok: true,
      eventId: EVENT,
      credit: { kind: 'missing' },
    });
  });

  // Multi-body case: at least one body issued → 'posted', even if others
  // failed. The attendee is not the reconciler; staff see the per-body detail.
  it("reports 'posted' when any body issued, even alongside skips", async () => {
    resolvesTo('ok');
    award.mockResolvedValueOnce([
      { bodyId: 'body-1', status: 'issued' },
      { bodyId: 'body-2', status: 'skipped', reason: 'no_licence' },
    ]);
    const res = await selfCheckIn(CODE);
    expect(res).toEqual({
      ok: true,
      eventId: EVENT,
      credit: { kind: 'posted' },
    });
  });

  // Each refusal implies a DIFFERENT action for someone standing at a door.
  // Before DEFERRED 57 these all fell through to "This registration is no
  // longer valid", which is actively false for an attendee who is simply early.
  it.each([
    ['not_open_yet', /isn't open yet/i],
    ['closed', /has closed/i],
    ['self_serve_off', /see reception/i],
    ['cancelled', /cancelled/i],
    ['unavailable', /isn't accepting check-ins/i],
    ['already', /already checked in/i],
    ['rate_limited', /too many attempts/i],
    ['no_matching_occurrence', /no matching session/i],
  ])('maps %s to its own message', async (code, expected) => {
    resolvesTo(code);
    const res = await selfCheckIn(CODE);
    expect(res).toHaveProperty('error');
    expect((res as { error: string }).error).toMatch(expected);
  });

  it('never awards a credit on a refusal', async () => {
    for (const code of ['not_open_yet', 'closed', 'self_serve_off', 'cancelled', 'unavailable', 'no_matching_occurrence']) {
      resolvesTo(code);
      await selfCheckIn(CODE);
    }
    expect(award).not.toHaveBeenCalled();
  });

  it('gives every refusal a distinct message', async () => {
    const seen: string[] = [];
    for (const code of ['not_open_yet', 'closed', 'self_serve_off', 'cancelled', 'unavailable', 'already', 'rate_limited', 'no_matching_occurrence']) {
      resolvesTo(code);
      const res = await selfCheckIn(CODE);
      seen.push((res as { error: string }).error);
    }
    // A regression that routes a code back into the generic default would
    // still "have an error" — only distinctness catches it.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('rejects a malformed code without calling the database', async () => {
    const res = await selfCheckIn('not-a-code');
    expect(res).toEqual({ error: 'Invalid code format.' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
