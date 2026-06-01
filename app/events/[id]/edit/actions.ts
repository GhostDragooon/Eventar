'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildEventQrPng } from '@/lib/qr';
import { getRequestOrigin } from '@/lib/origin';
import { buildCsv } from '@/lib/csv';
import { slugifyTitle } from '@/lib/slugify';

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

  // Origin via NEXT_PUBLIC_SITE_URL (with header fallback in dev) — prevents
  // host-header spoofing from poisoning the QR URL. See lib/origin.ts.
  const origin = await getRequestOrigin();

  return buildEventQrPng({ id: event.id, title: event.title }, origin);
}

export async function exportRegistrantsCsv(
  eventId: string,
): Promise<{ csvBase64: string; filename: string } | { error: string }> {
  await requireStaff();
  const supabase = await supabaseServer();

  // RLS gates the event read to the organizer / manager. .maybeSingle() lets us
  // surface "not found" as a real error rather than letting a silently-empty
  // result trickle through (CLAUDE.md rule 12).
  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, max_attendees')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!event) return { error: 'Event not found.' };

  // Single rows query is the source of truth for both the gate and the
  // metadata count — eliminates the race window where a separate `count`
  // query and the rows query could disagree if a registration lands in
  // between. Safe at the 200-attendee project scale.
  //
  // Service-role row read: organizer has already passed requireStaff and RLS
  // gated their event read above. The rows-themselves SELECT under admin
  // mirrors the email_log + capacity-count pattern used elsewhere.
  const admin = supabaseAdmin();
  const { data: rows, error: rowsErr } = await admin
    .from('registrations')
    .select('full_name, email, registered_at')
    .eq('event_id', event.id)
    .order('registered_at', { ascending: true });
  if (rowsErr) throw rowsErr;

  // "Registration closed" gate: event over OR at capacity. Same trigger logic
  // documented in design doc §C.
  const registeredCount = rows?.length ?? 0;
  const endTimeMs = new Date(event.end_time).getTime();
  const atCapacity =
    event.max_attendees != null && registeredCount >= event.max_attendees;
  const ended = endTimeMs < Date.now();

  if (!atCapacity && !ended) {
    return { error: 'Registration is not closed yet.' };
  }

  // CSV layout per design doc §C: event metadata header, blank separator row,
  // column header, data rows. Times are emitted as raw ISO + (timezone) so the
  // organizer can re-parse them deterministically; the venue/title go through
  // buildCsv's escape so commas in titles don't break parsing.
  const metadata: string[][] = [
    ['Event', event.title],
    ['Start', `${event.start_time} (${event.timezone})`],
    ['End', `${event.end_time} (${event.timezone})`],
    ['Venue', event.venue_name],
    ['Total registered', String(registeredCount)],
    [''], // blank separator row
    ['full_name', 'email', 'registered_at'],
  ];
  const dataRows: string[][] = (rows ?? []).map(r => [
    r.full_name,
    r.email,
    r.registered_at,
  ]);

  const csv = buildCsv([...metadata, ...dataRows]);
  const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');

  // YYYYMMDD in UTC for filename stability across timezones. Slug fallback
  // matches the QR filename pattern.
  const slug = slugifyTitle(event.title);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `registrants-${slug || event.id}-${today}.csv`;

  return { csvBase64, filename };
}
