import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { GeneralCategoryBand } from '@/components/dashboard/GeneralCategoryBand';
import { EventLifecycleSection } from '@/components/dashboard/EventLifecycleSection';
import { computeLifecycle, type Lifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { groupByLifecycle } from '@/lib/lifecycle/groupByLifecycle';

const LIFECYCLE_ORDER: Lifecycle[] = ['drafted', 'registering', 'upcoming', 'live', 'completed'];

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
  const decorated = (events ?? []).map((e) => {
    const counts = perEventCounts.get(e.id) ?? { registered: 0, attended: 0 };
    return {
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      timezone: e.timezone,
      venue_name: e.venue_name,
      max_attendees: e.max_attendees,
      registered: counts.registered,
      attended: counts.attended,
      lifecycle: computeLifecycle(e as EventLifecycleRow, nowMs),
      created_by: e.created_by as string | null,
    };
  });

  // Counts for General Category — count from decorated (which uses computeLifecycle for accuracy)
  const counts = {
    drafted: 0,
    registering: 0,
    upcoming: 0,
    live: 0,
    completed: 0,
  };
  for (const d of decorated) {
    if (d.lifecycle in counts) {
      counts[d.lifecycle as keyof typeof counts]++;
    }
  }

  // Days Until Next Event: min(start_time) among lifecycle ∈ {registering, upcoming, live}
  const upcomingPool = decorated.filter((d) =>
    d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live',
  );
  upcomingPool.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const nextEvent = upcomingPool[0] ?? null;
  const days = nextEvent
    ? Math.max(0, Math.ceil((new Date(nextEvent.start_time).getTime() - nowMs) / 86_400_000))
    : null;

  // Aggregate registration across Registering + Upcoming
  const aggregatePool = decorated.filter(
    (d) => d.lifecycle === 'registering' || d.lifecycle === 'upcoming',
  );
  const aggregateRegistration = aggregatePool.reduce((sum, d) => sum + d.registered, 0);
  const aggregateUpcomingCount = aggregatePool.length;

  // Team Task Completion — this user's events only.
  // staff.id is the staff row id; events.created_by references staff.id.
  // Reuse the already-computed lifecycle from `decorated` to avoid a second computeLifecycle pass.
  const myDecorated = decorated.filter((d) => d.created_by === staff.id);
  const yourCompleted = myDecorated.filter((d) => d.lifecycle === 'completed').length;

  // Group decorated events by lifecycle for rendering. Uses the pre-computed
  // lifecycle on each decorated item to avoid a second computeLifecycle pass.
  const decoratedByLifecycle = groupByLifecycle(decorated, (d) => d.lifecycle);

  // Sort within each lifecycle section per design doc:
  //   Completed → start_time DESC (most recent first)
  //   Others    → start_time ASC  (next-up first)
  for (const lifecycle of LIFECYCLE_ORDER) {
    decoratedByLifecycle[lifecycle].sort((a, b) => {
      const aMs = new Date(a.start_time).getTime();
      const bMs = new Date(b.start_time).getTime();
      return lifecycle === 'completed' ? bMs - aMs : aMs - bMs;
    });
  }

  const totalEvents = events?.length ?? 0;

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-xl border-b border-outline-variant pb-md gap-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Dashboard Overview</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            {totalEvents === 0
              ? 'No events yet. Create one to get started.'
              : `${totalEvents} event${totalEvents === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      <GeneralCategoryBand
        days={days}
        nextEventTitle={nextEvent?.title ?? null}
        nextIsLive={nextEvent?.lifecycle === 'live'}
        counts={counts}
        aggregateRegistration={aggregateRegistration}
        upcomingCount={aggregateUpcomingCount}
        yourCompleted={yourCompleted}
        yourTotal={myDecorated.length}
      />

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
        LIFECYCLE_ORDER.map((lifecycle) => (
          <EventLifecycleSection
            key={lifecycle}
            lifecycle={lifecycle}
            events={decoratedByLifecycle[lifecycle]}
            defaultCollapsed={lifecycle === 'completed'}
          />
        ))
      )}

      {/* Cancelled section (rare — only render if there are any). Not part of LIFECYCLE_ORDER. */}
      {decoratedByLifecycle.cancelled.length > 0 && (
        <EventLifecycleSection
          lifecycle="cancelled"
          events={decoratedByLifecycle.cancelled}
          defaultCollapsed={true}
        />
      )}
    </StaffShell>
  );
}
