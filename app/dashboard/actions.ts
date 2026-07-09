'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

type BulkResult = { ok: true; count: number } | { error: string };

// Owner/manager-gated bulk mutation over the caller's events. Reads go through
// admin (RLS-independent — review mode + session-less contexts); non-managers
// are constrained in-query to their own created_by. Matches the admin-after-
// auth pattern used across the app's staff actions.
async function bulkUpdate(eventIds: string[], patch: Record<string, unknown>): Promise<BulkResult> {
  if (eventIds.length === 0) return { ok: true, count: 0 };
  const staff = await requireStaff();
  const admin = supabaseAdmin();

  let q = admin.from('events').update(patch).in('id', eventIds);
  if (staff.role !== 'eventar_staff') q = q.eq('created_by', staff.id);
  const { data, error } = await q.select('id');
  if (error) return { error: 'Could not update the selected events.' };

  revalidatePath('/dashboard');
  return { ok: true, count: data?.length ?? 0 };
}

/** Soft-delete → the recoverable "Deleted" bucket (card Delete + bulk Archive). */
export async function softDeleteEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, { deleted_at: new Date().toISOString() });
}

/** Restore from the Deleted bucket. */
export async function restoreEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, { deleted_at: null });
}

/** Cancel (bulk) — sets the 'cancelled' status; distinct from delete. */
export async function cancelEvents(eventIds: string[]): Promise<BulkResult> {
  return bulkUpdate(eventIds, { status: 'cancelled' });
}
