import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import {
  DashboardWorkstation,
  type ProgrammeEvent,
  type DashboardMetrics,
} from '@/components/dashboard/DashboardWorkstation';
import { type AttentionItem } from '@/components/dashboard/NeedsAttention';
import { fetchDecoratedEvents } from '@/app/dashboard/data';
import { DevEmailStubBanner } from '@/components/dev/DevEmailStubBanner';

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

// Session-scoped staff page — never static-prerender (review mode skips the
// cookie read that would otherwise force dynamic).
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export default async function DashboardPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();

  let orgName: string | null = null;
  if (staff.organisation_id) {
    const { data: orgRow, error: orgErr } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', staff.organisation_id)
      .maybeSingle();
    if (orgErr) console.error('[dashboard] organisation name lookup failed', { code: orgErr.code });
    else orgName = orgRow?.name ?? null;
  }

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { events: decorated, registered7d, checkedInToday } = await fetchDecoratedEvents(supabase, nowMs);

  // ---- CPD pulse + capture rate (IA spec stat row) -------------------------
  const admin = supabaseAdmin();
  const [issuedRes, blockedRes] = await Promise.all([
    admin.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('entry_type', 'credit_earned'),
    admin
      .from('practitioner_licences')
      .select('id', { count: 'exact', head: true })
      .in('status', ['lapsed', 'revoked']),
  ]);
  if (issuedRes.error) console.error('[dashboard] credit_ledger count failed', { code: issuedRes.error.code });
  if (blockedRes.error) console.error('[dashboard] licence count failed', { code: blockedRes.error.code });
  const creditsIssued = issuedRes.count ?? 0;
  const creditsBlocked = blockedRes.count ?? 0;

  const startedIds = new Set(
    decorated.filter((d) => !d.deleted && d.startMs <= nowMs).map((d) => d.id),
  );
  const runRegistered = decorated
    .filter((d) => startedIds.has(d.id))
    .reduce((s, d) => s + d.registered, 0);
  const runAttended = decorated
    .filter((d) => startedIds.has(d.id))
    .reduce((s, d) => s + d.attended, 0);

  const isOpen = (d: ProgrammeEvent) =>
    !d.deleted && (d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live');
  const metrics: DashboardMetrics = {
    openRegistered: decorated.filter(isOpen).reduce((s, d) => s + d.registered, 0),
    registered7d,
    eventsThisWeek: decorated.filter((d) => !d.deleted && d.startMs >= nowMs && d.startMs <= nowMs + 7 * DAY_MS).length,
    closingSoon: decorated.filter((d) => isOpen(d) && d.closesInDays != null && d.closesInDays <= 7).length,
    checkedInToday,
    captureRate: runRegistered > 0 ? Math.round((runAttended / runRegistered) * 100) : null,
    creditsIssued,
    creditsBlocked,
    liveNow: decorated.filter((d) => !d.deleted && d.lifecycle === 'live').length,
  };

  // ---- "Needs attention" feed -----------------------------------------------
  const liveIds = decorated.filter((d) => !d.deleted && d.lifecycle === 'live').map((d) => d.id);
  const attentionEventIds = decorated.filter((d) => !d.deleted).slice(0, 60).map((d) => d.id);

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

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role, full_name: staff.full_name }}>
      <DevEmailStubBanner />
      <DashboardWorkstation events={decorated} attention={attention} metrics={metrics} orgName={orgName} nowMs={nowMs} />
    </StaffShell>
  );
}
