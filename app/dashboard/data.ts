import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/auth';
import type { ProgrammeEvent } from '@/components/dashboard/DashboardWorkstation';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { idBatches } from '@/lib/supabase/inBatches';

const DAY_MS = 86_400_000;

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: tz }).format(new Date(iso));
}

// 'a, b, c' -> 'a' | 'b' | 'c'. A string literal of plain columns separated by
// ', ' only: no embeds, aliases or casts. A non-literal string yields no columns,
// so every property access fails to compile instead of typing as any.
type Columns<S extends string> = string extends S
  ? never
  : S extends `${infer Head}, ${infer Rest}` ? Head | Columns<Rest> : S;

// The caller's own organisation's events, for every staff list: the
// Programme/Manage dashboards and the /checkin and /analytics pickers.
// events_public_read_published (RLS) legitimately lets any authenticated —
// or anon — caller read any PUBLISHED event, for the public discovery
// pages. These lists have no such purpose and must show only the caller's
// organisation's events. Relying on RLS alone mixed other orgs' published
// events into the caller's own event list — RLS answers "can this role read
// this row at all" (yes, it's public), not "does this page's business logic
// want this row." Same eventar_staff exception as canManageEvent().
export function ownEvents<Cols extends string>(
  supabase: SupabaseClient,
  staff: Pick<Staff, 'role' | 'organisation_id'>,
  cols: Cols,
) {
  // The row type is spelled out rather than left to supabase-js's select
  // parser: incremental tsc (the tsc gate, next build) ran out of memory
  // printing the parser's type for this exported generic. Same shape the
  // parser gives on this untyped client: one `any` per selected column.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = supabase.from('events').select<Cols, { [K in Columns<Cols>]: any }>(cols);
  if (staff.role !== 'eventar_staff') query = query.eq('organisation_id', staff.organisation_id);
  return query;
}

// credit_ledger has no organisation_id, so "credits issued" is counted over the organisation's event ids. Any failed
// batch gives an error and no total, never a partial count.
export async function countCreditsIssued(
  admin: SupabaseClient,
  eventIds: string[],
): Promise<{ count: number | null; error: { code?: string; message?: string } | null }> {
  const results = await Promise.all(
    idBatches(eventIds).map((ids) =>
      admin.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('entry_type', 'credit_earned').in('event_id', ids),
    ),
  );
  const error = results.find((r) => r.error)?.error ?? null;
  return { count: error ? null : results.reduce((n, r) => n + (r.count ?? 0), 0), error };
}

export async function fetchDecoratedEvents(
  supabase: SupabaseClient,
  nowMs: number,
  staff: Pick<Staff, 'role' | 'organisation_id'>,
): Promise<{ events: ProgrammeEvent[]; registered7d: number; checkedInToday: number }> {
  const { data: events, error: eventsErr } = await ownEvents(
    supabase,
    staff,
    'id, title, description, start_time, end_time, timezone, status, venue_name, max_attendees, registration_close_at, registration_open_at, created_by, category, deleted_at, format, hero_image_url, city, organized_by',
  )
    .order('start_time', { ascending: false })
    .limit(300);
  if (eventsErr) throw eventsErr;

  // ponytail: a batch of 100 events with over 1000 registrations is still cut by PostgREST's row cap.
  const eventIds = (events ?? []).map((e) => e.id);
  const regsRes = await Promise.all(
    idBatches(eventIds).map((ids) => supabase.from('registrations').select('event_id, status, registered_at, check_in_at').in('event_id', ids)),
  );
  const regsErr = regsRes.find((r) => r.error)?.error;
  if (regsErr) throw regsErr;
  const regs = regsRes.flatMap((r) => r.data ?? []);

  const weekAgoMs = nowMs - 7 * DAY_MS;
  const todayStartMs = new Date(new Date(nowMs).setHours(0, 0, 0, 0)).getTime();
  const counts = new Map<string, { registered: number; attended: number; delta7: number }>();
  for (const e of events ?? []) counts.set(e.id, { registered: 0, attended: 0, delta7: 0 });
  let registered7d = 0;
  let checkedInToday = 0;
  for (const r of regs) {
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
