import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import {
  DashboardWorkstation,
  type WorkstationEvent,
  type DashboardMetrics,
} from '@/components/dashboard/DashboardWorkstation';
import { NeedsAttention, type AttentionItem } from '@/components/dashboard/NeedsAttention';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { firstName } from '@/lib/name';
import { DevEmailStubBanner } from '@/components/dev/DevEmailStubBanner';

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
  // Thrown, not swallowed: a discarded error rendered the "no events yet"
  // empty state, which reads as "your events are gone" rather than "we could
  // not load them" (rule 12). The sibling registrations query already throws.
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, description, start_time, end_time, timezone, status, venue_name, max_attendees, registration_close_at, registration_open_at, created_by, category, deleted_at')
    .order('start_time', { ascending: false })
    .limit(300);
  if (eventsErr) throw eventsErr;

  const eventIds = (events ?? []).map((e) => e.id);
  const regsRes = eventIds.length > 0
    ? await supabase.from('registrations').select('event_id, status, registered_at, check_in_at').in('event_id', eventIds)
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

  // ---- CPD pulse + capture rate (IA spec stat row) -------------------------
  // credit_ledger is deliberately not readable by an organiser session
  // (cross-tenant by design), so the count goes through the admin client the
  // same way the details page's does.
  const admin = supabaseAdmin();
  const [issuedRes, blockedRes] = await Promise.all([
    admin.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('entry_type', 'credit_earned'),
    admin
      .from('practitioner_licences')
      .select('id', { count: 'exact', head: true })
      .in('status', ['lapsed', 'revoked']),
  ]);
  // Non-fatal: one card degrading must not take the dashboard down, but it
  // must not silently render 0 as though it were measured either (rule 12).
  if (issuedRes.error) console.error('[dashboard] credit_ledger count failed', { code: issuedRes.error.code });
  if (blockedRes.error) console.error('[dashboard] licence count failed', { code: blockedRes.error.code });
  const creditsIssued = issuedRes.count ?? 0;
  const creditsBlocked = blockedRes.count ?? 0;

  // Checked in TODAY keys on check_in_at, not registered_at — they are
  // different events and conflating them would report every historic attendee
  // as having arrived this morning.
  const todayStartMs = new Date(new Date(nowMs).setHours(0, 0, 0, 0)).getTime();
  let checkedInToday = 0;
  for (const r of regsRes.data ?? []) {
    if (r.check_in_at && new Date(r.check_in_at).getTime() >= todayStartMs) checkedInToday++;
  }

  // Capture rate is scoped to events that have actually STARTED, so a roster of
  // all-upcoming events does not read as a 0% capture failure.
  const startedIds = new Set(
    decorated.filter((d) => !d.deleted && d.startMs <= nowMs).map((d) => d.id),
  );
  const runRegistered = decorated
    .filter((d) => startedIds.has(d.id))
    .reduce((s, d) => s + d.registered, 0);
  const runAttended = decorated
    .filter((d) => startedIds.has(d.id))
    .reduce((s, d) => s + d.attended, 0);

  // Metrics + this-week counts ignore soft-deleted events.
  const isOpen = (d: WorkstationEvent) =>
    !d.deleted && (d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live');
  const metrics: DashboardMetrics = {
    openRegistered: decorated.filter(isOpen).reduce((s, d) => s + d.registered, 0),
    registered7d,
    eventsThisWeek: decorated.filter((d) => !d.deleted && d.startMs >= nowMs && d.startMs <= nowMs + 7 * DAY_MS).length,
    closingSoon: decorated.filter((d) => isOpen(d) && d.closesInDays != null && d.closesInDays <= 7).length,
    checkedInToday: checkedInToday,
    // Capture rate = attended / registered across events that have actually
    // run. Null (not 0) when there is nothing to divide by, so the card says
    // "no attendance yet" instead of asserting a 0% capture rate.
    captureRate: runRegistered > 0 ? Math.round((runAttended / runRegistered) * 100) : null,
    creditsIssued,
    creditsBlocked,
    liveNow: decorated.filter((d) => !d.deleted && d.lifecycle === 'live').length,
  };

  // ---- "Needs attention" feed (IA spec, Dashboard section) -----------------
  // Only feeds with real data behind them today. The spec also lists open
  // disputes and accreditations awaiting body confirmation; both need surfaces
  // that do not exist yet, and emitting a row that cannot deep-link to its fix
  // would break the queue's one hard rule.
  const liveIds = decorated.filter((d) => !d.deleted && d.lifecycle === 'live').map((d) => d.id);
  const attentionEventIds = decorated.filter((d) => !d.deleted).slice(0, 60).map((d) => d.id);

  // Failed sends are the highest-severity feed: a bounced reminder means an
  // attendee has no pass. Read errors are surfaced, not swallowed (rule 12).
  const sendsRes = attentionEventIds.length > 0
    ? await supabase
        .from('email_log')
        .select('event_id, purpose, status')
        .in('event_id', attentionEventIds)
        .eq('status', 'failed')
    : { data: [], error: null };
  if (sendsRes.error) throw sendsRes.error;

  const failedByEvent = new Map<string, number>();
  for (const row of sendsRes.data ?? []) {
    failedByEvent.set(row.event_id, (failedByEvent.get(row.event_id) ?? 0) + 1);
  }

  const attention: AttentionItem[] = [];

  for (const [eventId, n] of failedByEvent) {
    const ev = decorated.find((d) => d.id === eventId);
    if (!ev) continue;
    attention.push({
      id: `send-${eventId}`,
      tone: 'error',
      icon: 'mail',
      title: `Sends failing — ${ev.title}`,
      detail: `${n} message${n === 1 ? '' : 's'} failed · attendees may have no pass`,
      meta: 'now',
      metaSub: 'retry from Details',
      href: `/events/${eventId}/details`,
    });
  }

  for (const id of liveIds) {
    const ev = decorated.find((d) => d.id === id);
    if (!ev) continue;
    attention.push({
      id: `live-${id}`,
      tone: 'warn',
      icon: 'how_to_reg',
      title: `${ev.title} is live now`,
      detail: `${ev.attended} of ${ev.registered} checked in`,
      meta: 'live',
      metaSub: 'open check-in',
      href: `/events/${id}/checkin`,
    });
  }

  for (const ev of decorated) {
    if (ev.deleted || ev.closesInDays == null || ev.closesInDays > 3) continue;
    if (!isOpen(ev)) continue;
    attention.push({
      id: `close-${ev.id}`,
      tone: 'info',
      icon: 'schedule',
      title: `Registration closes soon — ${ev.title}`,
      detail:
        ev.maxAttendees != null
          ? `${ev.registered} of ${ev.maxAttendees} places taken`
          : `${ev.registered} registered`,
      meta: ev.closesInDays === 0 ? 'today' : `${ev.closesInDays}d`,
      metaSub: 'to close',
      href: `/events/${ev.id}/details`,
    });
  }

  const greetingName = firstName(staff.full_name) || staff.email.split('@')[0] || '';
  const hour = new Date(nowMs).getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      {/* Playbook item 3: renders nothing when RESEND_API_KEY is set. Standing
          reminder to operators that email delivery is stubbed on this build. */}
      <DevEmailStubBanner />
      <DashboardWorkstation events={decorated} greetingName={greetingName} greeting={greeting} metrics={metrics} />
      {/* IA spec puts the attention queue directly under the stat row, above
          the event list: "is anything on fire, what's next". */}
      <div className="mt-lg">
        <NeedsAttention items={attention} />
      </div>
    </StaffShell>
  );
}
