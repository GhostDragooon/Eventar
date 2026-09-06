'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type BulkResult = { ok: true; count: number } | { error: string };
type BulkAction = 'cancel' | 'soft_delete' | 'restore';

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
  if (eventIds.length === 0) return { ok: true, count: 0 };
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);
  // eslint-disable-next-line no-restricted-syntax -- attribution only; degrades to NULL, same as checkin/actions.ts
  const { data: authUser } = await supabase.auth.getUser();
  const admin = supabaseAdmin();

  const { data, error } = await admin.rpc('bulk_update_event_status', {
    p_event_ids: eventIds,
    p_action: action,
    p_actor_override: staff.id,
    p_actor_user_id: authUser?.user?.id ?? null,
  });
  if (error) return { error: 'Could not update the selected events.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/manage');
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
