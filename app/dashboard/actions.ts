'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canChangeEventStatus, canWriteEvent, requireStaff } from '@/lib/auth';
import { NOT_EVENT_WRITER } from '@/lib/lifecycle/eventLifecycle';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type BulkResult = { ok: true; count: number } | { error: string };
type BulkAction = 'cancel' | 'soft_delete' | 'restore';

const BULK_ROLE_MESSAGE = 'Your role cannot cancel, delete or restore events. Ask an organiser admin or member.';
// ponytail: 500 is far above any ticked page of events; raise it if bulk-select ever spans more.
const eventIdsSchema = z.array(z.string().uuid()).max(500);

// Owner/manager-gated bulk mutation over the caller's events, routed through
// the bulk_update_event_status() SECURITY DEFINER RPC (20260816070000) so
// every status/deleted_at change is audited — the prior direct
// admin.from('events').update() left no audit_events trace for any of the
// three actions. Table write stays on the admin (service_role) client,
// unchanged transport; the session client is used ONLY to read the real
// auth user id for audit attribution (mirrors app/events/[id]/checkin/
// actions.ts's own supabase.auth.getUser() pattern for award attribution —
// read-only, no RLS/permission risk). Ownership scoping (own events only,
// unless eventar_staff) now lives in the RPC's WHERE clause instead of here.
async function bulkUpdate(eventIds: string[], action: BulkAction): Promise<BulkResult> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);
  // Role gate before any read or write (the RPC refuses too: 20261104100000).
  if (!canChangeEventStatus(staff.role)) return { error: BULK_ROLE_MESSAGE };
  if (eventIds.length === 0) return { ok: true, count: 0 };
  if (!eventIdsSchema.safeParse(eventIds).success) return { error: 'Could not update the selected events.' };
  // eslint-disable-next-line no-restricted-syntax -- attribution only; degrades to NULL, same as checkin/actions.ts
  const { data: authUser } = await supabase.auth.getUser();
  const admin = supabaseAdmin();

  // Q51 (Ivan, 2026-11-07): a selection holding any event this account may not change is refused whole, naming
  // those events, before anything is written. The RPC refuses the same batch (42501 not_event_writer).
  const { data: rows, error: readErr } = await admin.from('events').select('id, title, organisation_id, created_by').in('id', eventIds);
  if (readErr) return { error: 'Could not update the selected events.' };
  const blocked = (rows ?? []).filter((r) => !canWriteEvent(staff, r));
  if (blocked.length > 0) {
    // Name only events of the caller's own organisation: an id from elsewhere must not reveal its title (dev review m1).
    const named = blocked.filter((r) => r.organisation_id === staff.organisation_id).map((r) => `“${r.title}”`);
    const other = blocked.length - named.length;
    const parts = [...(named.length ? [`Not yours: ${named.join(', ')}.`] : []), ...(other ? [`${other} selected ${other === 1 ? 'event is' : 'events are'} not in your organisation.`] : [])];
    return { error: `Nothing was changed. ${NOT_EVENT_WRITER} ${parts.join(' ')}` };
  }

  const { data, error } = await admin.rpc('bulk_update_event_status', {
    p_event_ids: eventIds,
    p_action: action,
    p_actor_override: staff.id,
    p_actor_user_id: authUser?.user?.id ?? null,
  });
  if (error) return { error: 'Could not update the selected events.' };

  revalidatePath('/dashboard');
  return { ok: true, count: data?.length ?? 0 };
}

/** Soft-delete → the recoverable "Deleted" bucket (card Delete + bulk Archive). */
export async function softDeleteEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, 'soft_delete');
}

/** Restore from the Deleted bucket. */
export async function restoreEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, 'restore');
}

/** Cancel (bulk) — sets the 'cancelled' status; distinct from delete. */
export async function cancelEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, 'cancel');
}
