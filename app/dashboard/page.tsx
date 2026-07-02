import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import {
  DashboardWorkstation,
  type WorkstationEvent,
  type DashboardMetrics,
} from '@/components/dashboard/DashboardWorkstation';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { firstName } from '@/lib/name';

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

// Session-scoped staff page — never static-prerender (review mode skips the
// cookie read that would otherwise force dynamic).
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: tz }).format(new Date(iso));
}

export default async function DashboardPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, start_time, end_time, timezone, status, venue_name, max_attendees, registration_close_at, registration_open_at, created_by, category, deleted_at')
    .order('start_time', { ascending: false })
    .limit(300);

  const eventIds = (events ?? []).map((e) => e.id);
  const regsRes = eventIds.length > 0
    ? await supabase.from('registrations').select('event_id, status, registered_at').in('event_id', eventIds)
    : { data: [], error: null };
  if (regsRes.error) throw regsRes.error;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7 * DAY_MS;

  // Per-event counts + 7-day registration velocity.
  const counts = new Map<string, { registered: number; attended: number; delta7: number }>();
  for (const e of events ?? []) counts.set(e.id, { registered: 0, attended: 0, delta7: 0 });
  let registered7d = 0;
  for (const r of regsRes.data ?? []) {
    const c = counts.get(r.event_id);
    if (!c) continue;
    c.registered++;
    if (r.status === 'attended') c.attended++;
    if (r.registered_at && new Date(r.registered_at).getTime() >= weekAgoMs) {
      c.delta7++;
      registered7d++;
    }
  }

  const decorated: WorkstationEvent[] = (events ?? []).map((e) => {
    const c = counts.get(e.id) ?? { registered: 0, attended: 0, delta7: 0 };
    const lifecycle = computeLifecycle(e as EventLifecycleRow, nowMs);
    const closeMs = e.registration_close_at ? new Date(e.registration_close_at).getTime() : null;
    const closesInDays = closeMs != null && closeMs > nowMs ? Math.ceil((closeMs - nowMs) / DAY_MS) : null;
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
    };
  });

  // Metrics + this-week counts ignore soft-deleted events.
  const isOpen = (d: WorkstationEvent) =>
    !d.deleted && (d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live');
  const metrics: DashboardMetrics = {
    openRegistered: decorated.filter(isOpen).reduce((s, d) => s + d.registered, 0),
    registered7d,
    eventsThisWeek: decorated.filter((d) => !d.deleted && d.startMs >= nowMs && d.startMs <= nowMs + 7 * DAY_MS).length,
    closingSoon: decorated.filter((d) => isOpen(d) && d.closesInDays != null && d.closesInDays <= 7).length,
  };

  const greetingName = firstName(staff.full_name) || staff.email.split('@')[0] || '';
  const hour = new Date(nowMs).getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <DashboardWorkstation events={decorated} greetingName={greetingName} greeting={greeting} metrics={metrics} />
    </StaffShell>
  );
}
