import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { EventBand, type TileEvent } from '@/components/dashboard/EventBand';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { firstName } from '@/lib/name';

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
    .select('id, title, start_time, end_time, timezone, status, venue_name, max_attendees, registration_close_at, created_by')
    .order('start_time', { ascending: false })
    .limit(200);

  const eventIds = (events ?? []).map((e) => e.id);
  const regsRes = eventIds.length > 0
    ? await supabase.from('registrations').select('event_id, status').in('event_id', eventIds)
    : { data: [], error: null };
  if (regsRes.error) throw regsRes.error;

  // Server component re-runs on every request; reading the wall clock once
  // here is fine. react-hooks/purity treats Date.now() as impure (correct
  // for client components, not for server components) — suppress.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  // Per-event registration counts
  const perEventCounts = new Map<string, { registered: number; attended: number }>();
  for (const e of events ?? []) perEventCounts.set(e.id, { registered: 0, attended: 0 });
  for (const r of regsRes.data ?? []) {
    const p = perEventCounts.get(r.event_id);
    if (!p) continue;
    p.registered++;
    if (r.status === 'attended') p.attended++;
  }

  // Decorate each event with its derived lifecycle + reg counts
  const decorated: TileEvent[] = (events ?? []).map((e) => {
    const counts = perEventCounts.get(e.id) ?? { registered: 0, attended: 0 };
    return {
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      timezone: e.timezone,
      max_attendees: e.max_attendees,
      registered: counts.registered,
      attended: counts.attended,
      registration_close_at: e.registration_close_at,
      lifecycle: computeLifecycle(e as EventLifecycleRow, nowMs),
    };
  });

  // 3-band collapse: Live (registering ∪ upcoming ∪ live), Draft, Completed.
  // Cancelled is its own tiny edge-case band rendered only if any exist.
  const live = decorated.filter(
    (d) => d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live',
  );
  const draft = decorated.filter((d) => d.lifecycle === 'drafted');
  const completed = decorated.filter((d) => d.lifecycle === 'completed');
  const cancelled = decorated.filter((d) => d.lifecycle === 'cancelled');

  // Live + Draft sort ASC (next-up first); Completed sorts DESC (most recent first).
  live.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  draft.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  completed.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  cancelled.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

  const totalEvents = events?.length ?? 0;
  const greetingName = firstName(staff.full_name);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-xl gap-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Your events</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            {`Welcome back${greetingName ? ', ' + greetingName : ''}.`}
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center gap-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>
          Create event
        </Link>
      </header>

      {totalEvents === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant mb-md">No events yet.</p>
          <Link
            href="/events/new"
            className="inline-flex items-center gap-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>
            Create your first event
          </Link>
        </div>
      ) : (
        <>
          <EventBand lifecycle="live" events={live} nowMs={nowMs} />
          <EventBand lifecycle="draft" events={draft} nowMs={nowMs} />
          <EventBand lifecycle="completed" events={completed} nowMs={nowMs} />
          <EventBand lifecycle="cancelled" events={cancelled} nowMs={nowMs} />
        </>
      )}
    </StaffShell>
  );
}
