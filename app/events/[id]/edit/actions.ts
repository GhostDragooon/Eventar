'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildEventQrPng } from '@/lib/qr';
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

  // Origin from request headers so this works on localhost, Vercel preview,
  // and prod (same pattern as sendMagicLink).
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

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

  // Service-role count: consistent with the public page's capacity-counter
  // pattern. The integer is non-sensitive; the rows themselves are PII and
  // come further down.
  const admin = supabaseAdmin();
  const { count: registeredCount, error: countErr } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id);
  if (countErr) throw countErr;

  // "Registration closed" gate: event over OR at capacity. Same trigger logic
  // documented in design doc §C. Service-role row read below is the actual
  // PII surface, so the gate must be tight.
  const endTimeMs = new Date(event.end_time).getTime();
  const atCapacity =
    event.max_attendees != null && (registeredCount ?? 0) >= event.max_attendees;
  const ended = endTimeMs < Date.now();

  if (!atCapacity && !ended) {
    return { error: 'Registration is not closed yet.' };
  }

  // Service-role row read: organizer has already passed requireStaff and RLS
  // gated their event read above. The rows-themselves SELECT under admin
  // mirrors the email_log + capacity-count pattern used elsewhere.
  const { data: rows, error: rowsErr } = await admin
    .from('registrations')
    .select('full_name, email, registered_at')
    .eq('event_id', event.id)
    .order('registered_at', { ascending: true });
  if (rowsErr) throw rowsErr;

  // CSV layout per design doc §C: event metadata header, blank separator row,
  // column header, data rows. Times are emitted as raw ISO + (timezone) so the
  // organizer can re-parse them deterministically; the venue/title go through
  // buildCsv's escape so commas in titles don't break parsing.
  const metadata: string[][] = [
    ['Event', event.title],
    ['Start', `${event.start_time} (${event.timezone})`],
    ['End', `${event.end_time} (${event.timezone})`],
    ['Venue', event.venue_name],
    ['Total registered', String(rows?.length ?? 0)],
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
