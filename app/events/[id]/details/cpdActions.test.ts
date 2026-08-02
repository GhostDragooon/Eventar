import { describe, expect, it, vi, beforeEach } from 'vitest';

// requireStaff is the auth gate; the RPC is the write path. Both are mocked so
// these tests exercise THIS action's own logic: validation, the both-or-neither
// rule, and the error-code translation an organiser actually reads.
const requireStaffMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireStaff: () => requireStaffMock(),
  NotAuthorizedError: class NotAuthorizedError extends Error {},
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ rpc: rpcMock }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { setEventCpdConfig } from './cpdActions';

const EVENT_ID = '11111111-2222-4333-8444-555555555555';
const BODY_ID = '99999999-8888-4777-8666-555555555555';

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  requireStaffMock.mockReset().mockResolvedValue({ email: 's@x.test', role: 'eventar_staff' });
  rpcMock.mockReset().mockResolvedValue({ error: null });
});

describe('setEventCpdConfig — validation', () => {
  it('accepts a body + hours pair and calls the audited RPC with them', async () => {
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '4.5' }));
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('set_event_cpd_config', {
      p_event_id: EVENT_ID,
      p_body_id: BODY_ID,
      p_cpd_hours: 4.5,
    });
  });

  it('accepts clearing BOTH fields (un-accrediting an event)', async () => {
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: '', cpdHours: '' }));
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('set_event_cpd_config', {
      p_event_id: EVENT_ID,
      p_body_id: null,
      p_cpd_hours: null,
    });
  });

  it('rejects a body with no hours WITHOUT calling the RPC', async () => {
    // Half-configured events silently skip issuance at check-in — the organiser
    // would believe the event was accredited and no credit would ever post.
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '' }));
    expect(result).toEqual({ error: expect.stringContaining('clear both') });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects hours above the 24h ceiling WITHOUT calling the RPC', async () => {
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '99' }));
    expect('error' in (result as object)).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('setEventCpdConfig — error translation', () => {
  // The raw messages name internal functions and constraints. What reaches an
  // organiser must say what happened and what to do instead.
  it('turns the freeze trigger (22023) into an explanation about issued credits', async () => {
    rpcMock.mockResolvedValue({ error: { code: '22023', message: 'freeze_cpd_config_if_credited ...' } });
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '3' }));
    expect(result).toEqual({ error: expect.stringContaining('already been issued') });
  });

  it('turns the ownership refusal (42501) into a plain permission message', async () => {
    rpcMock.mockResolvedValue({ error: { code: '42501', message: 'set_event_cpd_config: not the owner of event ...' } });
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '3' }));
    expect(result).toEqual({ error: 'Only the event owner can set its accreditation.' });
  });

  it('never leaks the raw Postgres message for an unmapped code', async () => {
    rpcMock.mockResolvedValue({ error: { code: 'XX000', message: 'internal detail: constraint foo_bar_fkey' } });
    const result = await setEventCpdConfig(null, fd({ eventId: EVENT_ID, bodyId: BODY_ID, cpdHours: '3' }));
    expect(result).toEqual({ error: 'Could not save the accreditation. Try again.' });
    expect(JSON.stringify(result)).not.toContain('foo_bar_fkey');
  });
});
