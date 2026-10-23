import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

type Role = 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
let mockRole: Role = 'organiser_member';
// canPublishEvents stays REAL: the pre-check is the thing under test.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: vi.fn(async () => ({
    id: 'staff-1',
    email: 'organiser@example.com',
    role: mockRole,
    full_name: 'Org Aniser',
    organisation_id: 'org-1',
  })),
}));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({ rpc }) }));
// The rest of actions.ts (QR, CSV export) is not under test here.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/qr', () => ({ buildEventQrPng: vi.fn() }));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn() }));

import { beforeEach, describe, expect, it } from 'vitest';
import { publishEvent } from './actions';

const EVENT_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  mockRole = 'organiser_member';
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  revalidatePath.mockClear();
});

// P2a (finding D, 2026-10-01): a refusal used to be thrown, which ended on the
// public crash page. Expected refusals are now a result the draft card shows
// inline; only an unexpected database failure still throws.
describe('publishEvent', () => {
  it.each(['body_admin', 'auditor'] as const)('%s is refused with a plain reason, before the database is asked', async (role) => {
    mockRole = role;
    await expect(publishEvent(EVENT_ID)).resolves.toEqual({
      error: expect.stringMatching(/can't publish events\. Ask an organiser admin to publish this draft/i),
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'] as const)('%s publishes: the RPC carries the caller as actor and the three pages are revalidated', async (role) => {
    mockRole = role;
    await expect(publishEvent(EVENT_ID)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('publish_event', { p_event_id: EVENT_ID, p_actor_override: 'staff-1' });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([`/events/${EVENT_ID}/edit`, `/events/${EVENT_ID}`, '/dashboard']);
  });

  it('a 42501 from the database comes back as a result, not a crash, and revalidates nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: "publish_event: event x not found or not in caller's organisation" } });
    await expect(publishEvent(EVENT_ID)).resolves.toEqual({ error: 'Cannot publish: event not found or not in your organisation.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('explains when the event is no longer an active draft', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'publish_event: only an active draft can be published' } });
    await expect(publishEvent(EVENT_ID)).resolves.toEqual({
      error: "This event can't be published because it is no longer a current draft. It may have been cancelled or deleted.",
      stale: true,
    });
    // Plain words, not the database's vocabulary.
    expect(JSON.stringify(await publishEvent(EVENT_ID))).not.toMatch(/active draft/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('an unexpected database failure still throws, so it is never reported as a refusal or as success', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    await expect(publishEvent(EVENT_ID)).rejects.toMatchObject({ code: '57014' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});


