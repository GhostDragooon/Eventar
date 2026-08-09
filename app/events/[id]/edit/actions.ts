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
  // Atomic + audited via publish_event() (SECURITY DEFINER): owner-exclusive
  // check happens in-function now, so a 42501 means "not found or not owned"
  // — preserved as the same thrown message as before (CLAUDE.md rule 12).
  const { error } = await supabase.rpc('publish_event', { p_event_id: id });
  if (error) {
    if (error.code === '42501') {
      throw new Error('Cannot publish: event not found or not owned by you.');
    }
    throw error;
  }
  revalidatePath(`/events/${id}/edit`);
  revalidatePath(`/events/${id}`);
  revalidatePath('/dashboard');
}

export async function getEventQrPng(
  eventId: string,
): Promise<{ pngBase64: string; filename: string } | { error: string }> {
  const staff = await requireStaff();
  const supabase = await supabaseServer();

  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, status, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;

  // Silent-failure-visibility: surface "not found" rather than letting RLS
  // turn this into a 0-row success (CLAUDE.md rule 12). Same pattern as
  // publishEvent above.
  if (!event) {
    return { error: 'Event not found.' };
  }

  // Ownership gate — NOT provided by the read above: supabaseServer() is an
  // anon-scoped client whose only matching policy is events_public_read_published
  // (any authenticated principal reads any published event), so requireStaff()
  // alone would let a non-owner staffer mint this event's QR. Owner-or-manager,
  // same shape as emailActions.ts::authorizeEvent. 'Event not found' hides
  // existence from a non-owner (matches the not-found copy above).
  const canManage = event.created_by === staff.id || staff.role === 'eventar_staff';
  if (!canManage) return { error: 'Event not found.' };

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
  const staff = await requireStaff();
  const supabase = await supabaseServer();

  // .maybeSingle() lets us surface "not found" as a real error rather than
  // letting a silently-empty result trickle through (CLAUDE.md rule 12).
  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!event) return { error: 'Event not found.' };

  // Ownership gate. The old comment claimed "RLS gates the event read to the
  // organizer / manager" — it does not: supabaseServer() reads via the anon
  // events_public_read_published policy (any authenticated principal reads any
  // published event), and the registrant rows below are read via supabaseAdmin()
  // (RLS bypassed). Without this check any active staff row could export another
  // organiser's full registrant name+email list. Owner-or-manager, matching
  // emailActions.ts::authorizeEvent; 'Event not found' hides existence.
  const canManage = event.created_by === staff.id || staff.role === 'eventar_staff';
  if (!canManage) return { error: 'Event not found.' };

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
