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
const { award } = vi.hoisted(() => ({ award: vi.fn(async () => undefined) }));
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
  award.mockClear();
});

describe('selfCheckIn — result code to attendee copy', () => {
  it('checks in and awards a credit on ok', async () => {
    resolvesTo('ok');
    const res = await selfCheckIn(CODE);
    expect(res).toEqual({ ok: true, eventId: EVENT });
    expect(award).toHaveBeenCalledOnce();
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
