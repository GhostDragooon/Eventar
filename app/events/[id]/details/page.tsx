import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';
import { deriveLeadingSession } from '@/lib/details/leadingSession';
import { RegistrationSection } from '@/components/details/RegistrationSection';
import { AttendanceSection } from '@/components/details/AttendanceSection';
import { FeedbackSection } from '@/components/details/FeedbackSection';
import { EmailSendControls } from './EmailSendControls';
import { LiveScoreboard } from '@/components/details/LiveScoreboard';
import { StickyLiveBar } from '@/components/details/StickyLiveBar';

export const metadata = {
  title: 'Event Manager',
  robots: { index: false, follow: false },
};

function fmtHM(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

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
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status, registration_close_at, registration_open_at, created_by')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, check_in_at, check_in_method, registered_at')
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
    event.created_by === staff.id || staff.role === 'eventar_staff';
  const confirmationsSent = canSeeConfirmationsSent
    ? (confirmationsRes.count ?? 0)
    : 0;
  const leadingSession = deriveLeadingSession(surveys, blocks);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lifecycle = computeLifecycle(event as EventLifecycleRow, nowMs);
  // Lock policy (locked 2026-06-19): structural fields freeze once published.
  const structuralLocked = lifecycle !== 'drafted' && lifecycle !== 'cancelled';

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      {/* Live-only sticky strip — separate element from the toolbar (locked). */}
      {lifecycle === 'live' && (
        <StickyLiveBar
          eventId={event.id}
          title={event.title}
          startMs={new Date(event.start_time).getTime()}
          endMs={new Date(event.end_time).getTime()}
          serverNowMs={nowMs}
        />
      )}

      {/* Event Manager header — eyebrow + title + status pill on the left, the
          for-use toolbar (Edit / Roster / Public / Analytics) top-right. */}
      <header className="mb-lg flex flex-col md:flex-row md:items-start md:justify-between gap-md">
        <div className="min-w-0">
          <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">Event Manager</p>
          <div className="flex items-center gap-sm flex-wrap">
            <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.025em] text-on-surface">{event.title}</h1>
            {structuralLocked && <LockIcon />}
            <StatusPill lifecycle={lifecycle} />
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs flex items-center gap-xs flex-wrap">
            <span>{formatInTz(event.start_time, event.timezone)}</span>
            {structuralLocked && <LockIcon />}
            <span aria-hidden>·</span>
            <span>{event.venue_name ?? 'No venue set'}</span>
            {structuralLocked && <LockIcon />}
          </p>
        </div>
        <ActionToolbar eventId={event.id} lifecycle={lifecycle} />
      </header>

      {/* Dark status scoreboard — the live operator's at-a-glance readout. */}
      <LiveScoreboard
        lifecycle={lifecycle}
        startMs={new Date(event.start_time).getTime()}
        endMs={new Date(event.end_time).getTime()}
        serverNowMs={nowMs}
        startLabel={fmtHM(event.start_time, event.timezone)}
        endLabel={fmtHM(event.end_time, event.timezone)}
        registered={regs.length}
        capacity={event.max_attendees}
        attended={attended}
        responses={responseCount}
      />

      <RegistrationSection
        eventId={event.id}
        registered={regs.length}
        maxAttendees={event.max_attendees}
        registrationCloseAt={event.registration_close_at}
        registeredAt={regs.map((r) => r.registered_at)}
        nowMs={nowMs}
        lifecycle={lifecycle}
        confirmationsSent={confirmationsSent}
        // Door prep: sending the reminder/pass belongs to the registration
        // wind-down (upcoming), categorized inside the section (not floating).
        actionSlot={
          canSeeConfirmationsSent && lifecycle === 'upcoming' ? (
            <EmailSendControls
              eventId={event.id}
              showReminder
              showSurvey={false}
              registeredCount={regs.filter((r) => r.status === 'registered').length}
              attendedCount={attended}
            />
          ) : undefined
        }
      />

      <AttendanceSection
        lifecycle={lifecycle}
        registered={regs.length}
        attended={attended}
        checkIns={regs.map((r) => ({ at: r.check_in_at, method: r.check_in_method }))}
        startTime={event.start_time}
        endTime={event.end_time}
        timezone={event.timezone}
        nowMs={nowMs}
        // Live door ops: late-arrival reminders live with attendance.
        actionSlot={
          canSeeConfirmationsSent && lifecycle === 'live' ? (
            <EmailSendControls
              eventId={event.id}
              showReminder
              showSurvey={false}
              registeredCount={regs.filter((r) => r.status === 'registered').length}
              attendedCount={attended}
            />
          ) : undefined
        }
      />

      <FeedbackSection
        lifecycle={lifecycle}
        eventId={event.id}
        responseCount={responseCount}
        attended={attended}
        leadingSession={leadingSession}
        endTime={event.end_time}
        timezone={event.timezone}
        // Post-event: survey invites live with feedback.
        actionSlot={
          canSeeConfirmationsSent && lifecycle === 'completed' ? (
            <EmailSendControls
              eventId={event.id}
              showReminder={false}
              showSurvey
              registeredCount={regs.filter((r) => r.status === 'registered').length}
              attendedCount={attended}
            />
          ) : undefined
        }
      />
    </StaffShell>
  );
}

// Inline `ti-lock` per the lock policy — tooltip carries the wording.
function LockIcon() {
  return (
    <span
      className="material-symbols-outlined text-[14px] text-on-surface-variant align-middle"
      title="Locked since registration opened"
      aria-label="Locked since registration opened"
      role="img"
    >
      lock
    </span>
  );
}

function ActionToolbar({ eventId, lifecycle }: { eventId: string; lifecycle: Lifecycle }) {
  const showRoster = lifecycle === 'registering' || lifecycle === 'upcoming' || lifecycle === 'live' || lifecycle === 'completed';
  const canAnalytics = lifecycle === 'completed';
  const showPublic = lifecycle === 'registering' || lifecycle === 'upcoming' || lifecycle === 'live';
  const base = 'inline-flex items-center gap-xs px-md py-sm rounded-lg border font-label-md text-label-md transition-colors';
  const outline = `${base} border-outline-variant text-on-surface hover:bg-surface-container-high`;
  const live = `${base} border-transparent bg-primary text-on-primary hover:opacity-90`;

  return (
    <div className="flex gap-xs flex-wrap shrink-0">
      <Link href={`/events/${eventId}/edit`} className={outline}>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>edit</span>Edit
      </Link>
      {showRoster && (
        <Link href={`/events/${eventId}/checkin`} className={lifecycle === 'live' ? live : outline}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden>group</span>Roster
        </Link>
      )}
      {showPublic && (
        <Link href={`/events/${eventId}`} target="_blank" rel="noreferrer" className={outline}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden>open_in_new</span>Public
        </Link>
      )}
      {canAnalytics ? (
        <Link href={`/events/${eventId}/analytics`} className={outline}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden>insights</span>Analytics
        </Link>
      ) : (
        <span className={`${base} border-outline-variant text-on-surface-variant opacity-50 cursor-not-allowed`} title="Available after the event completes">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>insights</span>Analytics
        </span>
      )}
    </div>
  );
}
