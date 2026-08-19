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

vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => ({
    id: 'staff-1',
    email: 'operator@example.test',
    role: 'organiser_admin',
    full_name: 'Test Operator',
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ rpc }) }));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user-1' } } }) },
  })),
}));

import { cancelEvents, softDeleteEvents, restoreEvents } from './actions';

beforeEach(() => {
  rpc.mockReset();
});

describe('dashboard bulk actions — route through the audited RPC', () => {
  it('cancelEvents calls bulk_update_event_status with action=cancel and both actor ids', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'evt-1' }, { id: 'evt-2' }], error: null });
    const res = await cancelEvents(['evt-1', 'evt-2']);
    expect(res).toEqual({ ok: true, count: 2 });
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', {
      p_event_ids: ['evt-1', 'evt-2'],
      p_action: 'cancel',
      p_actor_override: 'staff-1',
      p_actor_user_id: 'auth-user-1',
    });
  });

  it('softDeleteEvents calls with action=soft_delete', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'evt-1' }], error: null });
    await softDeleteEvents(['evt-1']);
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', expect.objectContaining({ p_action: 'soft_delete' }));
  });

  it('restoreEvents calls with action=restore', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'evt-1' }], error: null });
    await restoreEvents(['evt-1']);
    expect(rpc).toHaveBeenCalledWith('bulk_update_event_status', expect.objectContaining({ p_action: 'restore' }));
  });

  it('returns count:0 without calling the RPC for an empty id list', async () => {
    const res = await cancelEvents([]);
    expect(res).toEqual({ ok: true, count: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC error as a generic failure message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await cancelEvents(['evt-1']);
    expect(res).toEqual({ error: 'Could not update the selected events.' });
  });

  it('a partial result (some events not owned) reports only the affected count', async () => {
    // Mirrors the RPC's own silent-filter behavior: passing 2 ids but owning
    // only 1 returns just the owned row, same as the prior direct .update()
    // + .eq('created_by', ...) did.
    rpc.mockResolvedValueOnce({ data: [{ id: 'evt-1' }], error: null });
    const res = await cancelEvents(['evt-1', 'evt-not-owned']);
    expect(res).toEqual({ ok: true, count: 1 });
  });
});
