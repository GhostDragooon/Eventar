'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function publishEvent(id: string) {
  await requireStaff();
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('events')
    .update({ status: 'published' })
    .eq('id', id);
  if (error) throw error;
  revalidatePath(`/events/${id}/edit`);
  revalidatePath('/dashboard');
}
