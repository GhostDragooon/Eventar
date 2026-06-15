import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { sectionState } from '@/lib/lifecycle/sectionState';
import { formatInTz } from '@/lib/tz';
import { deriveLeadingSession } from '@/lib/details/leadingSession';
import { RegistrationSection } from '@/components/details/RegistrationSection';
import { AttendanceSection } from '@/components/details/AttendanceSection';
import { FeedbackSection } from '@/components/details/FeedbackSection';

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  let staff;
  try { staff = await requireStaff(); }
  catch (e) { if (e instanceof NotAuthorizedError) redirect('/login'); throw e; }

  const { id } = await params;
  const supabase = await supabaseServer();
  // email_log is RLS-locked to service role (init_email_log.sql) — staff reads
  // for the G6 "sent" count must go through supabaseAdmin().
  const admin = supabaseAdmin();

  const [eventRes, regsRes, surveysRes, blocksRes, confirmationsRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status, registration_close_at, created_by')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, check_in_at, registered_at')
      .eq('event_id', id),
    // E.3: fetch the Q2 columns so we can both count responses AND derive the
    // leading session in one round-trip (replaces the head:true count-only call).
    supabase
      .from('survey_responses')
      .select('valuable_block_id, valuable_overall, submitted_at')
      .eq('event_id', id)
      .order('submitted_at', { ascending: true }),
    // Titles for the leading-session join. Only session-kind blocks can be a
    // valid valuable_block_id (enforced in submitSurvey), but we don't filter
    // by kind here — deriveLeadingSession just looks up the title by id.
    supabase
      .from('agenda_blocks')
      .select('id, title')
      .eq('event_id', id),
    // G6: count only `sent` confirmations. Failed/queued don't count.
    // head:true → server returns just the count, no rows.
    admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('purpose', 'confirmation')
      .eq('status', 'sent'),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (confirmationsRes.error) throw confirmationsRes.error;

  const event = eventRes.data;
  const regs = regsRes.data ?? [];
  const surveys = surveysRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const responseCount = surveys.length;
  const attended = regs.filter((r) => r.status === 'attended').length;
  // Gate the admin email_log count on owner-or-manager. supabaseAdmin bypasses
  // RLS, so without this gate a peer organizer could read the confirmations-sent
  // count for any event by typing the URL. Non-authorized readers see 0, which
  // is consistent with the all-zero RLS-gated registration counts they'll see.
  const canSeeConfirmationsSent =
    event.created_by === staff.id || staff.role === 'manager';
  const confirmationsSent = canSeeConfirmationsSent
    ? (confirmationsRes.count ?? 0)
    : 0;
  const leadingSession = deriveLeadingSession(surveys, blocks);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lifecycle = computeLifecycle(event as EventLifecycleRow, nowMs);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      {/* Header — patterns §9: pill leads the title row (top-left). Toolbar is
          its own row below the meta line. Old in-header "← Dashboard" link is
          gone: the StaffShell NAV's back link already covers it. */}
      <header className="mb-xl flex flex-col gap-md">
        <div>
          <div className="mb-xs">
            <StatusPill lifecycle={lifecycle} />
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{event.title}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            {formatInTz(event.start_time, event.timezone)} · {event.venue_name ?? 'No venue set'}
          </p>
        </div>
        <ActionToolbar eventId={event.id} lifecycle={lifecycle} />
      </header>

      <RegistrationSection
        eventId={event.id}
        registered={regs.length}
        maxAttendees={event.max_attendees}
        registrationCloseAt={event.registration_close_at}
        registeredAt={regs.map((r) => r.registered_at)}
        nowMs={nowMs}
        lifecycle={lifecycle}
        state={sectionState('registration', lifecycle)}
        confirmationsSent={confirmationsSent}
      />

      <AttendanceSection
        lifecycle={lifecycle}
        state={sectionState('attendance', lifecycle)}
        eventId={event.id}
        registered={regs.length}
        attended={attended}
        checkIns={regs.map((r) => r.check_in_at)}
        startTime={event.start_time}
      />

      <FeedbackSection
        lifecycle={lifecycle}
        state={sectionState('feedback', lifecycle)}
        eventId={event.id}
        responseCount={responseCount}
        attended={attended}
        leadingSession={leadingSession}
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
          className={
            lifecycle === 'live'
              ? 'flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity'
              : 'flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors'
          }
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
