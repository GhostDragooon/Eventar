// bulk_update_event_status() (20260816070000) closed a real gap: cancel/
// soft-delete/restore wrote no audit_events row for any of the three. This
// file tests ONE thing — that bulkUpdate calls the RPC with the right
// action/actor params per exported function, and surfaces its result/error
// correctly. The RPC's own auth/ownership/audit behavior is exercised live
// against the local stack (see this migration's own header comment); no
// RLS test file exists for it, matching this repo's stance that a live
// functional test here would leave a permanent audit_events row on every
// environment it runs on.
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireStaff } = vi.hoisted(() => ({ requireStaff: vi.fn() }));
// canChangeEventStatus stays real: the role table is the thing under test.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff,
}));
const staffWithRole = (role: string) => ({
  id: 'staff-1',
  email: 'operator@example.test',
  role,
  full_name: 'Test Operator',
  organisation_id: 'org1',
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { rpc, eventRows } = vi.hoisted(() => ({ rpc: vi.fn(), eventRows: { value: [] as Array<Record<string, string>> } }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    rpc,
    from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => ({ data: eventRows.value.filter((r) => ids.includes(r.id)), error: null }) }) }),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user-1' } } }) },
  })),
}));

import { cancelEvents, softDeleteEvents, restoreEvents } from './actions';

const EVT_1 = '11111111-1111-4111-8111-111111111111';
const EVT_2 = '22222222-2222-4222-8222-222222222222';
const EVT_OTHER = '33333333-3333-4333-8333-333333333333';

const row = (id: string, created_by = 'staff-1', title = `Event ${id.slice(0, 4)}`) => ({ id, title, organisation_id: 'org1', created_by });

beforeEach(() => {
  eventRows.value = [row(EVT_1), row(EVT_2), row(EVT_OTHER)];
  rpc.mockReset();
  requireStaff.mockReset();
  requireStaff.mockResolvedValue(staffWithRole('organiser_admin'));
});

describe('dashboard bulk actions — route through the audited RPC', () => {
  it('cancelEvents calls bulk_update_event_status with action=cancel and both actor ids', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_1 }, { id: EVT_2 }], error: null });
    const res = await cancelEvents([EVT_1, EVT_2]);
    expect(res).toEqual({ ok: true, count: 2 });
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', {
      p_event_ids: [EVT_1, EVT_2],
      p_action: 'cancel',
      p_actor_override: 'staff-1',
      p_actor_user_id: 'auth-user-1',
    });
  });

  it('softDeleteEvents calls with action=soft_delete', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_1 }], error: null });
    await softDeleteEvents([EVT_1]);
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', expect.objectContaining({ p_action: 'soft_delete' }));
  });

  it('restoreEvents calls with action=restore', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_1 }], error: null });
    await restoreEvents([EVT_1]);
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', expect.objectContaining({ p_action: 'restore' }));
  });

  it('returns count:0 without calling the RPC for an empty id list', async () => {
    const res = await cancelEvents([]);
    expect(res).toEqual({ ok: true, count: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC error as a generic failure message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await cancelEvents([EVT_1]);
    expect(res).toEqual({ error: 'Could not update the selected events.' });
  });

  it('a partial result (some events not owned) reports only the affected count', async () => {
    // Mirrors the RPC's own silent-filter behavior: passing 2 ids but owning
    // only 1 returns just the owned row, same as the prior direct .update()
    // + .eq('created_by', ...) did.
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_1 }], error: null });
    const res = await cancelEvents([EVT_1, EVT_OTHER]);
    expect(res).toEqual({ ok: true, count: 1 });
  });
});

// Security audit M1 (20261104100000): any active staff role used to pass. The gate runs after requireStaff and
// before any read or write; the RPC refuses the same two roles with 42501 (tests/rls/bulk_update_event_status_gate).
describe('dashboard bulk actions — role gate and input check', () => {
  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'])('%s reaches the RPC', async (role) => {
    requireStaff.mockResolvedValue(staffWithRole(role));
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_1 }], error: null });
    expect(await cancelEvents([EVT_1])).toEqual({ ok: true, count: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['body_admin', 'auditor'])('%s is refused with a plain message and the RPC is never called', async (role) => {
    requireStaff.mockResolvedValue(staffWithRole(role));
    for (const fn of [cancelEvents, softDeleteEvents, restoreEvents]) {
      const res = await fn([EVT_1]);
      expect(res).toEqual({ error: expect.stringMatching(/role cannot cancel, delete or restore/i) });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a refused role is refused even for an empty list (the gate comes first)', async () => {
    requireStaff.mockResolvedValue(staffWithRole('auditor'));
    expect(await cancelEvents([])).toEqual({ error: expect.any(String) });
  });

  it('requireStaff runs even for an empty list (Hard Rule 3: no early return above the gate)', async () => {
    requireStaff.mockRejectedValue(new Error('not authorized'));
    await expect(cancelEvents([])).rejects.toThrow('not authorized');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses ids that are not uuids without calling the RPC', async () => {
    expect(await cancelEvents(['not-a-uuid'])).toEqual({ error: 'Could not update the selected events.' });
    expect(await cancelEvents([EVT_1, "x'; drop table events;--"])).toEqual({ error: 'Could not update the selected events.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses more than 500 ids without calling the RPC', async () => {
    const many = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(await cancelEvents(many)).toEqual({ error: 'Could not update the selected events.' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

// Q51 (Ivan, 2026-11-07): a member acts only on events it created; a mixed selection is refused whole, by name.
const requireStaffMock_member = () => requireStaff.mockResolvedValue(staffWithRole('organiser_member'));

describe('dashboard bulk actions — Q51 event-writer rule', () => {
  it('a member selecting a colleague\'s event changes nothing and is told which event is not theirs', async () => {
    requireStaff.mockResolvedValue(staffWithRole('organiser_member'));
    eventRows.value = [row(EVT_1), row(EVT_2, 'staff-2', 'Colleague talk')];
    const res = await cancelEvents([EVT_1, EVT_2]);
    expect(res).toEqual({ error: expect.stringContaining('“Colleague talk”') });
    expect((res as { error: string }).error).toMatch(/^Nothing was changed\./);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an id from another organisation is counted, never named (dev review m1)', async () => {
    requireStaffMock_member();
    eventRows.value = [row(EVT_1), { id: EVT_OTHER, title: 'Secret other-org event', organisation_id: 'org2', created_by: 'x' }];
    const res = await cancelEvents([EVT_1, EVT_OTHER]);
    const msg = (res as { error: string }).error;
    expect(msg).toMatch(/1 selected event is not in your organisation\./);
    expect(msg).not.toMatch(/Secret/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an admin may change a colleague\'s event', async () => {
    eventRows.value = [row(EVT_2, 'staff-2')];
    rpc.mockResolvedValueOnce({ data: [{ id: EVT_2 }], error: null });
    expect(await cancelEvents([EVT_2])).toEqual({ ok: true, count: 1 });
  });
});
