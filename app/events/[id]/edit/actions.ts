'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildEventQrPng } from '@/lib/qr';

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

export async function getEventQrPng(
  eventId: string,
): Promise<{ pngBase64: string; filename: string } | { error: string }> {
  await requireStaff();
  const supabase = await supabaseServer();

  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, status')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;

  // Silent-failure-visibility: surface "not found" rather than letting RLS
  // turn this into a 0-row success (CLAUDE.md rule 12). Same pattern as
  // publishEvent above.
  if (!event) {
    return { error: 'Event not found.' };
  }

  // Defense in depth — the UI also gates on event.status === 'published',
  // but a future refactor that exposes this action elsewhere would skip the
  // UI guard. Belt + braces.
  if (event.status !== 'published') {
    return { error: 'QR is available after publishing.' };
  }

  // Origin from request headers so this works on localhost, Vercel preview,
  // and prod (same pattern as sendMagicLink).
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  return buildEventQrPng({ id: event.id, title: event.title }, origin);
}
