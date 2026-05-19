'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function publishEvent(id: string) {
  await requireStaff();
  const supabase = await supabaseServer();
  // .select() + .maybeSingle() lets us detect when the update affected 0
  // rows — which happens when RLS silently blocks (e.g. organizer trying
  // to publish another organizer's event). Without this check, the action
  // would return success but the event status would stay 'draft' (silent
  // failure — CLAUDE.md rule 12).
  const { data, error } = await supabase
    .from('events')
    .update({ status: 'published' })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Cannot publish: event not found or not owned by you.');
  revalidatePath(`/events/${id}/edit`);
  revalidatePath(`/events/${id}`);
  revalidatePath('/dashboard');
}
