import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgrammeEvent } from '@/components/dashboard/DashboardWorkstation';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';

const DAY_MS = 86_400_000;

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: tz }).format(new Date(iso));
}

export async function fetchDecoratedEvents(
  supabase: SupabaseClient,
  nowMs: number,
): Promise<{ events: ProgrammeEvent[]; registered7d: number; checkedInToday: number }> {
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, description, start_time, end_time, timezone, status, venue_name, max_attendees, registration_close_at, registration_open_at, created_by, category, deleted_at, format, hero_image_url, city, organized_by')
    .order('start_time', { ascending: false })
    .limit(300);
  if (eventsErr) throw eventsErr;

  const eventIds = (events ?? []).map((e) => e.id);
  const regsRes = eventIds.length > 0
    ? await supabase.from('registrations').select('event_id, status, registered_at, check_in_at').in('event_id', eventIds)
    : { data: [] as Array<{ event_id: string; status: string; registered_at: string | null; check_in_at: string | null }>, error: null };
  if (regsRes.error) throw regsRes.error;

  const weekAgoMs = nowMs - 7 * DAY_MS;
  const todayStartMs = new Date(new Date(nowMs).setHours(0, 0, 0, 0)).getTime();
  const counts = new Map<string, { registered: number; attended: number; delta7: number }>();
  for (const e of events ?? []) counts.set(e.id, { registered: 0, attended: 0, delta7: 0 });
  let registered7d = 0;
  let checkedInToday = 0;
  for (const r of regsRes.data ?? []) {
    const c = counts.get(r.event_id);
    if (!c) continue;
    c.registered++;
    if (r.status === 'attended') c.attended++;
    if (r.registered_at && new Date(r.registered_at).getTime() >= weekAgoMs) {
      c.delta7++;
      registered7d++;
    }
    if (r.check_in_at && new Date(r.check_in_at).getTime() >= todayStartMs) checkedInToday++;
  }

  const decorated: ProgrammeEvent[] = (events ?? []).map((e) => {
    const c = counts.get(e.id) ?? { registered: 0, attended: 0, delta7: 0 };
    const lifecycle = computeLifecycle(e as EventLifecycleRow, nowMs);
    const closeMs = e.registration_close_at ? new Date(e.registration_close_at).getTime() : null;
    const closesInDays = closeMs != null && closeMs > nowMs ? Math.ceil((closeMs - nowMs) / DAY_MS) : null;
    const organizedBy = Array.isArray(e.organized_by) ? (e.organized_by as Array<{ name?: string }>) : [];
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      lifecycle,
      startMs: new Date(e.start_time).getTime(),
      dateLabel: fmtDate(e.start_time, e.timezone),
      timeLabel: fmtTime(e.start_time, e.timezone),
      venueName: e.venue_name,
      maxAttendees: e.max_attendees,
      registered: c.registered,
      attended: c.attended,
      delta7: c.delta7,
      closesInDays,
      category: e.category,
      deleted: e.deleted_at != null,
      format: e.format ?? null,
      hero_image_url: e.hero_image_url ?? null,
      city: e.city ?? null,
      hosts: organizedBy.filter((h) => h.name).map((h) => ({ name: h.name as string, avatar_url: null })),
    };
  });

  return { events: decorated, registered7d, checkedInToday };
}
