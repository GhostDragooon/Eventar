import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';

export const metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false },
};

// Session-scoped staff page — never static-prerender (review mode skips the
// cookie read that would otherwise force dynamic).
export const dynamic = 'force-dynamic';

// Global Analytics index — the nav tab's target. Completed events, most
// recent first; each row opens the per-event post-event review.
export default async function AnalyticsIndexPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, status, venue_name, registration_close_at, registration_open_at, deleted_at')
    .is('deleted_at', null)
    .in('status', ['published', 'completed'])
    .order('start_time', { ascending: false })
    .limit(100);
  if (eventsErr) throw eventsErr;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const prelim = (events ?? [])
    .map((e) => ({ ...e, lifecycle: computeLifecycle(e as EventLifecycleRow, nowMs) }))
    .filter((e) => e.lifecycle === 'completed');

  // Outcome numbers per row — a review-picker should show the review.
  const ids = prelim.map((e) => e.id);
  const [regsRes, surveysRes] = ids.length > 0
    ? await Promise.all([
        supabase.from('registrations').select('event_id, status').in('event_id', ids),
        supabase.from('survey_responses').select('event_id').in('event_id', ids),
      ])
    : [
        { data: [] as Array<{ event_id: string; status: string }>, error: null },
        { data: [] as Array<{ event_id: string }>, error: null },
      ];
  // Thrown, not swallowed: these two feed the attendance and response-rate
  // figures. A failed query rendered 0 attended / 0 responses — a confidently
  // wrong number on the screen an organiser reviews an event by, and
  // attendance is what CPD credit is issued against.
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;
  const counts = new Map<string, { registered: number; attended: number; responses: number }>();
  for (const e of prelim) counts.set(e.id, { registered: 0, attended: 0, responses: 0 });
  for (const r of regsRes.data ?? []) {
    const c = counts.get(r.event_id);
    if (!c) continue;
    c.registered++;
    if (r.status === 'attended') c.attended++;
  }
  for (const r of surveysRes.data ?? []) {
    const c = counts.get(r.event_id);
    if (c) c.responses++;
  }
  const completed = prelim.map((e) => ({ ...e, ...(counts.get(e.id) ?? { registered: 0, attended: 0, responses: 0 }) }));

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="mb-lg">
        <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">Analytics</p>
        <h1 className="text-[calc(30px*var(--text-scale))] leading-[1.1] font-extrabold tracking-[-0.025em] text-on-surface">Pick a completed event to review</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">{completed.length} completed event{completed.length === 1 ? '' : 's'}</p>
      </header>

      {completed.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">No completed events yet — analytics unlock after an event wraps.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {completed.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}/analytics`}
                className="flex items-center gap-md bg-surface-container-lowest border border-outline-variant rounded-[16px] p-md hover:bg-surface-container-low transition-colors"
              >
                <span className="w-[4px] self-stretch rounded-full shrink-0 bg-outline-variant" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="font-title-lg text-title-lg font-semibold text-on-surface truncate">{e.title}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-[2px]">
                    {formatInTz(e.start_time, e.timezone)}{e.venue_name ? ` · ${e.venue_name}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="leading-none">
                    <span className="text-[calc(24px*var(--text-scale))] font-extrabold tracking-[-0.02em] tabular-nums text-on-surface">{e.attended}</span>
                    <span className="text-body-md text-on-surface-variant"> / {e.registered} attended</span>
                  </p>
                  <p className="font-label-md text-label-md text-[color:var(--on-primary-container)] font-semibold normal-case tracking-normal mt-[2px]">
                    {e.responses} response{e.responses === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant shrink-0" aria-hidden>insights</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
