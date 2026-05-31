import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';
import { RegistrationSection } from '@/components/details/RegistrationSection';
import { AttendanceSection } from '@/components/details/AttendanceSection';
import { FeedbackSection } from '@/components/details/FeedbackSection';

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  let staff;
  try { staff = await requireStaff(); }
  catch (e) { if (e instanceof NotAuthorizedError) redirect('/login'); throw e; }

  const { id } = await params;
  const supabase = await supabaseServer();

  const [eventRes, regsRes, surveysRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status, registration_close_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, check_in_at, registered_at')
      .eq('event_id', id),
    supabase
      .from('survey_responses')
      .select('id, key_highlights, submitted_at')
      .eq('event_id', id)
      .order('submitted_at', { ascending: false })
      .limit(1),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;

  const event = eventRes.data;
  const regs = regsRes.data ?? [];
  const latestSurvey = surveysRes.data?.[0] ?? null;
  const responseCount = surveysRes.data?.length ?? 0;
  const attended = regs.filter((r) => r.status === 'attended').length;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lifecycle = computeLifecycle(event as EventLifecycleRow, nowMs);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="mb-xl">
        <Link
          href="/dashboard"
          className="text-label-md font-label-md text-primary tracking-widest uppercase mb-xs block hover:underline"
        >
          ← Dashboard
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start gap-md">
          <div>
            <div className="flex items-center gap-sm mb-xs flex-wrap">
              <StatusPill lifecycle={lifecycle} />
              <span className="font-body-md text-body-md text-on-surface-variant">
                {formatInTz(event.start_time, event.timezone)} · {event.venue_name ?? 'No venue set'}
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{event.title}</h1>
          </div>
          <ActionToolbar eventId={event.id} lifecycle={lifecycle} />
        </div>
      </header>

      <RegistrationSection
        registered={regs.length}
        maxAttendees={event.max_attendees}
        registrationCloseAt={event.registration_close_at}
        registeredAt={regs.map((r) => r.registered_at)}
        nowMs={nowMs}
        lifecycle={lifecycle}
      />

      <AttendanceSection
        lifecycle={lifecycle}
        eventId={event.id}
        registered={regs.length}
        attended={attended}
        checkIns={regs.map((r) => r.check_in_at)}
        startTime={event.start_time}
      />

      <FeedbackSection
        lifecycle={lifecycle}
        eventId={event.id}
        responseCount={responseCount}
        attended={attended}
        latestSurvey={latestSurvey}
        nowMs={nowMs}
      />
    </StaffShell>
  );
}

function ActionToolbar({ eventId, lifecycle }: { eventId: string; lifecycle: Lifecycle }) {
  const showRoster = lifecycle === 'registering' || lifecycle === 'upcoming' || lifecycle === 'live' || lifecycle === 'completed';
  const showAnalytics = lifecycle === 'completed';
  const showPublic = lifecycle === 'registering' || lifecycle === 'upcoming' || lifecycle === 'live';

  return (
    <div className="flex gap-sm flex-wrap">
      <Link
        href={`/events/${eventId}/edit`}
        className="flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>edit</span>
        Edit event
      </Link>
      {showRoster && (
        <Link
          href={`/events/${eventId}/checkin`}
          className="flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>group</span>
          Open roster
        </Link>
      )}
      {showAnalytics && (
        <Link
          href={`/events/${eventId}/analytics`}
          className="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>insights</span>
          View analytics
        </Link>
      )}
      {showPublic && (
        <Link
          href={`/events/${eventId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>open_in_new</span>
          Public page
        </Link>
      )}
    </div>
  );
}
