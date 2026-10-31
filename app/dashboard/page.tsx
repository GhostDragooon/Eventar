import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import { EventsHome } from '@/components/dashboard/EventsHome';
import { TAB_KEYS } from '@/components/dashboard/eventTabs';
import { NeedsAttention, type AttentionItem } from '@/components/dashboard/NeedsAttention';
import { fetchDecoratedEvents } from '@/app/dashboard/data';
import { DevEmailStubBanner } from '@/components/dev/DevEmailStubBanner';
import { organiserTz } from '@/lib/tz';

export const metadata = {
  title: 'Events',
  robots: { index: false, follow: false },
};

// Session-scoped staff page — never static-prerender (review mode skips the
// cookie read that would otherwise force dynamic).
export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const { tab } = await searchParams;
  const initialTab = TAB_KEYS.find((k) => k === tab);

  const supabase = await supabaseServer();

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const tz = organiserTz((await cookies()).get('eventar-tz')?.value);
  const { events: decorated } = await fetchDecoratedEvents(supabase, nowMs, staff, tz);
  const admin = supabaseAdmin();
  const isOpen = (d: (typeof decorated)[number]) =>
    !d.deleted && (d.lifecycle === 'registering' || d.lifecycle === 'upcoming' || d.lifecycle === 'live');

  // ---- "Needs attention" feed -----------------------------------------------
  const liveIds = decorated.filter((d) => !d.deleted && d.lifecycle === 'live').map((d) => d.id);
  const attentionEventIds = decorated.filter((d) => !d.deleted).slice(0, 60).map((d) => d.id);

  // email_log has no RLS policies and no grant for `authenticated` — every
  // other read in this codebase goes through supabaseAdmin() (see
  // lib/email/eventEmails.ts's explicit "NOT the RLS-scoped supabaseServer"
  // convention). This query used the session-scoped `supabase` client
  // instead, which 42501s for any real signed-in staff member with at least
  // one event — invisible under review mode, since review mode's borrowed
  // identity always ran this query as service_role (RLS/grants bypassed
  // entirely) until requireStaff() was fixed to stop doing that
  // unconditionally (2026-09-17).
  const sendsRes = attentionEventIds.length > 0
    ? await admin
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
      {attention.length > 0 && <div className="mb-lg"><NeedsAttention items={attention} limit={3} /></div>}
      <EventsHome key={tz} events={decorated} nowMs={nowMs} initialTab={initialTab} />
    </StaffShell>
  );
}
