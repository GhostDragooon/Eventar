import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { StaffShell } from '@/components/shell/StaffShell';

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
    .select('id, title, start_time, end_time, timezone, status, venue_name, max_attendees')
    .order('start_time', { ascending: false })
    .limit(50);

  // Cross-event totals for the metric cards. Service-role read mirrors the
  // exportRegistrantsCsv pattern — staff already passed requireStaff above
  // and we deliberately want metrics across all events the manager has
  // visibility into (RLS would over-filter for the manager role).
  const admin = supabaseAdmin();
  const [{ count: totalRegistered }, { count: totalAttended }] = await Promise.all([
    admin.from('registrations').select('*', { count: 'exact', head: true }),
    admin
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'attended'),
  ]);

  const totalEvents = events?.length ?? 0;
  const registered = totalRegistered ?? 0;
  const attended = totalAttended ?? 0;
  const attendanceRate = registered > 0 ? Math.round((attended / registered) * 100) : 0;

  // Server component re-runs on every request; reading the wall clock once
  // here is fine. react-hooks/purity treats Date.now() as impure (correct
  // for client components, not for server components) — suppress.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const upcoming = (events ?? []).filter((e) => new Date(e.start_time).getTime() > nowMs);
  const past = (events ?? []).filter((e) => new Date(e.start_time).getTime() <= nowMs);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-xl border-b border-outline-variant pb-md gap-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            Dashboard Overview
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            {totalEvents === 0
              ? 'No events yet. Create one to get started.'
              : `${totalEvents} event${totalEvents === 1 ? '' : 's'} · ${upcoming.length} upcoming`}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-grid-gutter mb-xl">
        <MetricCard
          label="Total Events"
          value={totalEvents}
          icon="event"
          hint={
            upcoming.length > 0
              ? `${upcoming.length} upcoming`
              : past.length > 0
                ? 'All past — create a new one'
                : 'No events yet'
          }
        />
        <MetricCard
          label="Total Registrations"
          value={registered}
          icon="groups"
          hint={
            registered === 0
              ? 'Awaiting first registration'
              : `Across ${totalEvents} event${totalEvents === 1 ? '' : 's'}`
          }
        />
        <MetricCard
          label="Checked In"
          value={attended}
          icon="how_to_reg"
          hint={
            registered === 0
              ? '—'
              : `${attendanceRate}% attendance rate`
          }
          progress={registered === 0 ? undefined : attendanceRate}
        />
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] shadow-sm">
        <div className="p-md border-b border-outline-variant flex justify-between items-center">
          <h2 className="font-title-lg text-title-lg text-on-surface">Events</h2>
          <Link
            href="/events/new"
            className="font-label-md text-label-md text-primary hover:underline"
          >
            + New event
          </Link>
        </div>

        {totalEvents === 0 ? (
          <div className="p-xl text-center text-on-surface-variant">
            <p className="font-body-md text-body-md mb-md">No events yet.</p>
            <Link
              href="/events/new"
              className="inline-flex items-center gap-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden>
                add
              </span>
              Create your first event
            </Link>
          </div>
        ) : (
          <ul>
            {events!.map((e, i) => (
              <li
                key={e.id}
                className={
                  i === events!.length - 1
                    ? ''
                    : 'border-b border-surface-container-highest'
                }
              >
                <Link
                  href={`/events/${e.id}/edit`}
                  className="flex items-start gap-md p-md hover:bg-surface-container-low transition-colors group"
                >
                  <div className="w-28 flex flex-col gap-xs shrink-0">
                    <span className="font-label-md text-label-md text-on-surface">
                      {formatInTz(e.start_time, e.timezone)}
                    </span>
                    <span className="font-body-md text-[12px] text-on-surface-variant">
                      {e.timezone}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-title-lg text-title-lg text-on-surface group-hover:text-primary transition-colors truncate">
                      {e.title}
                    </h3>
                    {e.venue_name && (
                      <p className="font-body-md text-body-md text-on-surface-variant mt-xs flex items-center gap-xs">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden>
                          location_on
                        </span>
                        <span className="truncate">{e.venue_name}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-sm mt-sm flex-wrap">
                      <StatusPill status={e.status} />
                      {e.max_attendees != null && (
                        <span className="bg-surface-container-high text-on-surface-variant font-label-md text-label-md px-sm py-xs rounded-full">
                          Cap {e.max_attendees}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </StaffShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
  progress,
}: {
  label: string;
  value: number;
  icon: string;
  hint: string;
  progress?: number;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[20px] p-lg border border-outline-variant shadow-sm flex flex-col justify-between min-h-[160px]">
      <div className="flex justify-between items-start">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase">
          {label}
        </h3>
        <span
          className="material-symbols-outlined text-primary bg-primary-container/10 p-xs rounded-md"
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="font-display text-display text-on-surface">{value}</p>
        {progress !== undefined && (
          <div
            className="w-full bg-surface-container-highest h-2 rounded-full mt-sm overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="font-label-md text-label-md text-on-surface-variant mt-xs">{hint}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  // Three event statuses in this app: draft, published, completed (the
  // last is post-end-time). Each gets a distinct pill colour so the list
  // is scannable at a glance.
  const styles: Record<string, string> = {
    published:
      'bg-primary-container/10 text-primary border border-primary-container/20',
    draft:
      'bg-surface-container-high text-on-surface-variant border border-outline-variant',
    completed:
      'bg-secondary-fixed text-on-secondary-fixed border border-transparent',
  };
  const cls = styles[status] ?? styles.draft;
  return (
    <span
      className={`font-label-md text-label-md px-sm py-xs rounded-full uppercase ${cls}`}
    >
      {status}
    </span>
  );
}
