import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';

export const metadata = {
  title: 'Check-in',
  robots: { index: false, follow: false },
};

// Session-scoped staff page — never static-prerender (review mode skips the
// cookie read that would otherwise force dynamic).
export const dynamic = 'force-dynamic';

// Global Check-in index — the nav tab's target. Picks the event whose door
// you're running: live events first (green), then upcoming/registering.
// Per-event TC remains at /events/[id]/checkin.
export default async function CheckinIndexPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  // Both errors are thrown, not swallowed (rule 12). A discarded events error
  // rendered "No open events" — an empty state indistinguishable from a failed
  // load, on the screen an operator opens to find the door they are running. A
  // discarded registrations error was worse: every event rendered "0 / 0
  // checked in", a confidently wrong count rather than an absent one.
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, status, venue_name, registration_close_at, registration_open_at, deleted_at')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('start_time', { ascending: true })
    .limit(100);
  if (eventsErr) throw eventsErr;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const prelim = (events ?? [])
    .map((e) => ({ ...e, lifecycle: computeLifecycle(e as EventLifecycleRow, nowMs) }))
    .filter((e) => e.lifecycle === 'live' || e.lifecycle === 'upcoming' || e.lifecycle === 'registering');

  // Per-event roster counts — the door-picker should read like the dashboard,
  // not a bare link list.
  const ids = prelim.map((e) => e.id);
  const regsRes = ids.length > 0
    ? await supabase.from('registrations').select('event_id, status').in('event_id', ids)
    : { data: [] as Array<{ event_id: string; status: string }>, error: null };
  if (regsRes.error) throw regsRes.error;
  const counts = new Map<string, { registered: number; attended: number }>();
  for (const e of prelim) counts.set(e.id, { registered: 0, attended: 0 });
  for (const r of regsRes.data ?? []) {
    const c = counts.get(r.event_id);
    if (!c) continue;
    c.registered++;
    if (r.status === 'attended') c.attended++;
  }
  const rows = prelim.map((e) => ({ ...e, ...(counts.get(e.id) ?? { registered: 0, attended: 0 }) }));
  const live = rows.filter((e) => e.lifecycle === 'live');
  const upcoming = rows.filter((e) => e.lifecycle !== 'live');

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="mb-lg">
        <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">Check-in</p>
        <h1 className="text-[calc(30px*var(--text-scale))] leading-[1.1] font-extrabold tracking-[-0.025em] text-on-surface">Pick an event to run the door</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
          {live.length > 0 ? `${live.length} live now` : 'Nothing live right now'} · {upcoming.length} coming up
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">No open events. Check-in unlocks 60 minutes before an event starts.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {[...live, ...upcoming].map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}/checkin`}
                className="flex items-center gap-md bg-surface-container-lowest border border-outline-variant rounded-[16px] p-md hover:bg-surface-container-low transition-colors"
              >
                <span className={`w-[4px] self-stretch rounded-full shrink-0 ${e.lifecycle === 'live' ? 'bg-[color:var(--success)]' : 'bg-[color:var(--on-primary-container)]'}`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm flex-wrap">
                    <p className="font-title-lg text-title-lg font-semibold text-on-surface truncate">{e.title}</p>
                    {e.lifecycle === 'live' && (
                      <span className="inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide bg-success-container text-on-success-container shrink-0">
                        <span className="w-[6px] h-[6px] rounded-full bg-[color:var(--success)]" aria-hidden />Live
                      </span>
                    )}
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-[2px]">
                    {formatInTz(e.start_time, e.timezone)}{e.venue_name ? ` · ${e.venue_name}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="leading-none">
                    <span className={`text-[calc(24px*var(--text-scale))] font-extrabold tracking-[-0.02em] tabular-nums ${e.lifecycle === 'live' ? 'text-[color:var(--success)]' : 'text-on-surface'}`}>{e.attended}</span>
                    <span className="text-body-md text-on-surface-variant"> / {e.registered}</span>
                  </p>
                  <p className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal mt-[2px]">checked in</p>
                </div>
                <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant shrink-0" aria-hidden>arrow_forward</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
