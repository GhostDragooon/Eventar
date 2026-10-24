import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const requireStaffMock = vi.fn(async () => ({ id: 'staff-1', email: 'a@b.com', role: 'organiser_admin', organisation_id: 'org-1' }));
vi.mock('@/lib/auth', () => ({ requireStaff: () => requireStaffMock() }));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

let rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
let rpcResult: { data?: string | null; error: { message: string; code?: string } | null } = { data: eventId0(), error: null };
function eventId0() { return '11111111-2222-4333-8444-555555555555'; }
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      return rpcResult;
    },
  })),
}));

import { updateRegistrationContact } from './actions';

const eventId = eventId0();
const registrationId = '66666666-7777-4888-8999-000000000000';
const valid = { registrationId, fullName: '  Chan Tai Man ', email: '  Chan@Example.COM ' };

describe('updateRegistrationContact', () => {
  beforeEach(() => {
    rpcCalls = [];
    rpcResult = { data: eventId, error: null };
    revalidatePathMock.mockClear();
    requireStaffMock.mockClear();
  });

  it('asks staff first, sends the trimmed and lower-cased values to the audited RPC, and revalidates the roster pages', async () => {
    expect(await updateRegistrationContact(valid)).toEqual({ ok: true });
    expect(requireStaffMock).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toEqual([
      { fn: 'update_registration_contact', params: { p_registration_id: registrationId, p_full_name: 'Chan Tai Man', p_email: 'chan@example.com', p_actor_override: 'staff-1' } },
    ]);
    for (const page of ['checkin', 'details', 'registrations']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${eventId}/${page}`);
    }
  });

  it('refreshes the event the database says the registration belongs to', async () => {
    const other = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    rpcResult = { data: other, error: null };
    await updateRegistrationContact(valid);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${other}/checkin`);
    expect(revalidatePathMock).not.toHaveBeenCalledWith(`/events/${eventId}/checkin`);
  });

  it('propagates a requireStaff rejection before any work, even for invalid input', async () => {
    requireStaffMock.mockRejectedValueOnce(new Error('not authorized'));
    await expect(updateRegistrationContact({ ...valid, fullName: '' })).rejects.toThrow('not authorized');
    expect(rpcCalls).toHaveLength(0);
  });

  it.each([
    ['a bad registration id', { ...valid, registrationId: 'x' }, /./],
    ['an empty name', { ...valid, fullName: '   ' }, /A name is required/],
    ['a name over 200 characters', { ...valid, fullName: 'x'.repeat(201) }, /at most 200/],
    ['an email that is not an email', { ...valid, email: 'not-an-email' }, /not an email address/],
  ])('refuses %s before the database is asked', async (_label, input, message) => {
    const res = await updateRegistrationContact(input);
    expect(res).toEqual({ error: expect.stringMatching(message) });
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    ['linked_registration: this registration belongs to an Eventar account', undefined, /belongs to an Eventar account.*The name can/],
    ['already_registered: another registration for this event already uses that email', '23505', /already uses that email/],
    ['update_registration_contact: registration x not found', 'P0002', /Registration not found/],
    ['update_registration_contact: registration x is not in your organisation', '42501', /do not have access/],
    ['something else entirely', undefined, /Could not save the change/],
  ])('says %s in plain words and revalidates nothing', async (message, code, expected) => {
    rpcResult = { error: { message, code } };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await updateRegistrationContact(valid)).toEqual({ error: expect.stringMatching(expected) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    // Only the unmapped failure leaves a trace, and it carries the id and the code, never the message or the values.
    if (expected.source === 'Could not save the change') {
      expect(log).toHaveBeenCalledWith('[roster] contact update failed', { registrationId, code: code });
    } else {
      expect(log).not.toHaveBeenCalled();
    }
    log.mockRestore();
  });
});
