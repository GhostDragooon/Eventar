import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { StaffShell } from '@/components/shell/StaffShell';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { deriveSpeakerNames } from '@/lib/agenda';
import RosterClient from './RosterClient';

export const metadata = {
  title: 'Check-in',
  robots: { index: false, follow: false },
};

export default async function StaffCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select(
      'id, title, start_time, end_time, timezone, venue_name, status, max_attendees, registration_close_at, registration_open_at, created_by',
    )
    .eq('id', id)
    .maybeSingle();
  // Thrown, not swallowed: a discarded error fell through to notFound(), so an
  // operator opening the door screen minutes before an event was told the
  // event does not exist — on the one surface where they have no time to
  // diagnose it (rule 12). The sibling roster reads below already throw.
  if (eventErr) throw eventErr;
  if (!event) notFound();

  // Owner-only gate: /checkin mutates registrations (status → attended).
  // Per the 2026-06-02 access policy refinement, check-in is owner-exclusive
  // (reverses Q4's prior "manager running multi-event check-in" use case).
  // Non-owners bounce to /details for the read-only ops lens.
  if (event.created_by !== staff.id) {
    redirect(`/events/${id}/details`);
  }

  // Initial roster paint: organiser/manager RLS already gates this read.
  // The client subscribes to Realtime postgres_changes for live updates.
  // Agenda blocks → derive the speaker list (host + topic speakers, deduped);
  // speaker_checkins → initial paint of the TC speakers card.
  const [rosterRes, blocksRes, checkinsRes] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, full_name, email, registration_code, status, check_in_at, check_in_method')
      .eq('event_id', id)
      .order('full_name', { ascending: true }),
    supabase
      .from('agenda_blocks')
      .select('host, topics')
      .eq('event_id', id),
    supabase
      .from('speaker_checkins')
      .select('speaker_name, checked_in_at')
      .eq('event_id', id),
  ]);

  // Read-time CPD eligibility (Stage 7). Definer RPC: every hop of the identity
  // chain (registration email → auth.users → verified licence) is invisible to
  // an organiser's session, so this cannot be a join above. Returns
  // registration_id + enum only — no PII.
  // Non-fatal: the roster is the operating surface at a live door and must
  // render even if this read fails. Visible, not silent (rule 12).
  const eligRes = await supabase.rpc('event_registration_eligibility', { p_event_id: id });
  if (eligRes.error) {
    console.error('[checkin] eligibility read failed', { code: eligRes.error.code });
  }
  const eligibility: Record<string, string> = Object.fromEntries(
    ((eligRes.data ?? []) as { registration_id: string; eligibility: string }[])
      .map((e) => [e.registration_id, e.eligibility]),
  );

  if (rosterRes.error) throw rosterRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (checkinsRes.error) throw checkinsRes.error;

  const speakerNames = deriveSpeakerNames(blocksRes.data ?? []);
  const initialSpeakerCheckins = checkinsRes.data ?? [];

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lifecycle = computeLifecycle(event as EventLifecycleRow, nowMs);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref={`/events/${id}/details`} backLabel="Event">
      {/* Per patterns §8 the StaffShell's NAV owns all back-navigation; this
          header only carries the page title (no breadcrumb — that would
          duplicate the top NAV's "Back to Event" link). */}
      <header className="mb-lg">
        {/* Function-leads eyebrow (locked naming rule). */}
        <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">
          Check-in
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-sm">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-md text-on-surface-variant">
          <p className="font-body-md text-body-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>schedule</span>
            {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
          </p>
          {event.venue_name && (
            <p className="font-body-md text-body-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>location_on</span>
              {event.venue_name}
            </p>
          )}
        </div>
      </header>

      <RosterClient
        eventId={event.id}
        eventTimezone={event.timezone}
        eventStartTime={event.start_time}
        lifecycle={lifecycle}
        initialRoster={rosterRes.data ?? []}
        eligibility={eligibility}
        eligibilityUnavailable={Boolean(eligRes.error)}
        maxAttendees={event.max_attendees}
        speakerNames={speakerNames}
        initialSpeakerCheckins={initialSpeakerCheckins}
      />
    </StaffShell>
  );
}
