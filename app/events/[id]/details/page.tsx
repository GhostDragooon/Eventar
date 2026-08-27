import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { LayoutDashboardIcon, CalendarDaysIcon } from 'lucide-react';
import { ReadinessStrip, type ReadinessCell } from '@/components/details/ReadinessStrip';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { formatInTz } from '@/lib/tz';
import { deriveLeadingSession } from '@/lib/details/leadingSession';
import { RegistrationSection } from '@/components/details/RegistrationSection';
import { AttendanceSection } from '@/components/details/AttendanceSection';
import { FeedbackSection } from '@/components/details/FeedbackSection';
import { listAuthorisedBodies } from '@/lib/cpd/authorisedBodies';
import { isMultiBodyConfigured } from '@/lib/cpd/multiBodyShape';
import { CpdAccreditationSection } from '@/components/details/CpdAccreditationSection';
import { MultiBodyAccreditationWizard, type WizardGroup, type WizardOccurrence } from '@/components/details/MultiBodyAccreditationWizard';
import { PassDeliveryPanel } from '@/components/details/PassDeliveryPanel';
import { EmailDeliveryStrip, type EmailDeliveryRow } from '@/components/details/EmailDeliveryStrip';
import { EmailSendControls } from './EmailSendControls';
import { EvidenceExportButton } from './EvidenceExportButton';
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

  // The accrediting-body list is NOT in this batch: which bodies are offerable
  // depends on the event's organisation (DEFERRED 56), so it cannot be fetched
  // until the event row has resolved.
  const [eventRes, regsRes, surveysRes, blocksRes, confirmationsRes, creditsRes, deliveryRes, deliveryAggRes, accGroupsRes, occurrencesRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status, registration_close_at, registration_open_at, created_by, accrediting_body_id, cpd_hours, organisation_id')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('registrations')
      // full_name is for the pass-delivery panel, which names who has no usable
      // pass — a count alone gives the organiser nothing to act on.
      .select('id, status, check_in_at, check_in_method, registered_at, full_name')
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
    // Credits already on the ledger for this event. Non-zero means the DB
    // freeze trigger will refuse any config change, so the form is disabled.
    // credit_ledger reads need the admin client: it is deliberately not
    // readable by an organiser's own session (cross-tenant by design).
    // No .eq('entry_type', ...) filter — the DB freeze triggers (20260815020000)
    // check `exists(... where event_id = ...)` with no entry-type filter of
    // their own, so this predicate must match that exactly or the UI can
    // show "unfrozen" for an event the DB already refuses to change.
    admin
      .from('credit_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id),
    // Per-recipient pass delivery. Admin like the sibling reads above:
    // email_log has no anon/authenticated policy at all (service-role only),
    // and this page's auth gate has already run.
    admin
      .from('email_log')
      .select('registration_id, purpose, status')
      .eq('event_id', id)
      .not('registration_id', 'is', null),
    // Aggregate for the EmailDeliveryStrip (playbook item 4). Distinct query
    // from the per-recipient read above because that one filters out rows
    // without a registration_id — which excludes a confirmation whose
    // registration insert failed at Step 5. Those rows still belong in the
    // operator-facing count of failed confirmations. Purpose+status is the
    // only pair needed; kept as a separate cheap read rather than dropping
    // the per-recipient read's not-null filter (which would then need
    // downstream code to handle NULLs).
    admin
      .from('email_log')
      .select('purpose, status')
      .eq('event_id', id),
    // C5 multi-body wizard's initial state — nested embed follows the FK
    // chain groups -> accreditations -> occurrence links in one round trip.
    supabase
      .from('event_accreditation_groups')
      .select('id, body_id, category_code, unit, award_scheme, event_accreditations(id, credit_value, event_accreditation_occurrences(occurrence_id))')
      .eq('event_id', id),
    supabase
      .from('event_occurrences')
      .select('id, ordinal, name, starts_at')
      .eq('event_id', id)
      .order('ordinal'),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (confirmationsRes.error) throw confirmationsRes.error;
  // A failure here must not take down the whole event page — the accreditation
  // card is one section of many — but it must NOT be silent either (rule 12).
  // The first version swallowed both errors, and a wrong column name in the
  // bodies select then rendered an empty dropdown that looked exactly like
  // "this deployment has no accrediting bodies". Log the code (no PII, no row
  // data) and pass an explicit failure flag so the section can say so.
  if (creditsRes.error) {
    console.error('[details] credit_ledger count failed', { code: creditsRes.error.code });
  }
  const creditsIssued = creditsRes.count ?? 0;

  // C5 wizard's initial state. A read failure here must not take the page
  // down (same posture as credit/delivery above) — the wizard just opens
  // empty, which is honest (organiser can still add groups; it never claims
  // "nothing configured" when the read simply failed silently).
  if (accGroupsRes.error) {
    console.error('[details] event_accreditation_groups read failed', { code: accGroupsRes.error.code });
  }
  if (occurrencesRes.error) {
    console.error('[details] event_occurrences read failed', { code: occurrencesRes.error.code });
  }
  type RawGroup = {
    id: string;
    body_id: string;
    category_code: string | null;
    unit: string | null;
    award_scheme: 'proportional' | 'explicit_schedule';
    event_accreditations: Array<{ id: string; credit_value: number; event_accreditation_occurrences: Array<{ occurrence_id: string }> }>;
  };
  const wizardGroups: WizardGroup[] = ((accGroupsRes.data ?? []) as RawGroup[]).map((g) => ({
    id: g.id,
    bodyId: g.body_id,
    categoryCode: g.category_code,
    unit: g.unit,
    awardScheme: g.award_scheme,
    rows: g.event_accreditations.map((a) => ({
      id: a.id,
      credit_value: a.credit_value,
      occurrenceIds: a.event_accreditation_occurrences.map((o) => o.occurrence_id),
    })),
  }));
  const wizardOccurrences: WizardOccurrence[] = (occurrencesRes.data ?? []) as WizardOccurrence[];

  // "Has any accreditation group" is NOT the same question as "is a real
  // multi-body config" — the compatibility bridge writes one group for every
  // plain single-body save too. See lib/cpd/multiBodyShape.ts for why
  // conflating them breaks in both directions, and for the correspondence
  // with set_event_cpd_config's own guard.
  const multiBodyConfigured = isMultiBodyConfigured(wizardGroups, wizardOccurrences.length);

  // Same posture as the credit count: one panel failing must not take the page
  // down, but it must not read as "everyone got their pass" either (rule 12).
  // A failed read yields no rows, which would render every attendee as
  // "not sent" — alarming but never falsely reassuring, so it fails loud.
  if (deliveryRes.error) {
    console.error('[details] email_log delivery read failed', { code: deliveryRes.error.code });
  }
  const deliveryRows = (deliveryRes.data ?? []) as Array<{
    registration_id: string;
    purpose: string;
    status: 'queued' | 'sent' | 'failed';
  }>;

  // EmailDeliveryStrip aggregate — same failure posture. An empty aggregate on
  // read-failure renders as "all zeros", which is the honest "we cannot
  // measure this right now" state rather than a false OK.
  if (deliveryAggRes.error) {
    console.error('[details] email_log aggregate read failed', { code: deliveryAggRes.error.code });
  }
  const deliveryAggRows: EmailDeliveryRow[] = (deliveryAggRes.data ?? []) as EmailDeliveryRow[];

  const event = eventRes.data;
  // Deferred until now: offerable bodies depend on the event's organisation.
  const authorised = await listAuthorisedBodies(event.organisation_id as string);
  const accreditingBodies = authorised.bodies;
  const bodiesUnavailable = authorised.unavailable;
  const noAuthorisedBodies = !authorised.unavailable && authorised.bodies.length === 0;

  // bodyDirectory: accreditingBodies (offerable, for the add-body picker) plus
  // any body already bound to an existing group whose org-authorisation has
  // since lapsed — same "still show the real binding" posture as
  // CpdAccreditationSection's own currentIsMissing handling, generalised to
  // N groups instead of one scalar column.
  const authorisedIds = new Set(accreditingBodies.map((b) => b.id));
  const missingBodyIds = [...new Set(wizardGroups.map((g) => g.bodyId).filter((bid) => !authorisedIds.has(bid)))];
  let bodyDirectory = accreditingBodies;
  if (missingBodyIds.length > 0) {
    const missingRes = await admin
      .from('accrediting_bodies')
      .select('id, full_name, short_name, cycle_config')
      .in('id', missingBodyIds);
    if (missingRes.error) {
      console.error('[details] missing accrediting_bodies lookup failed', { code: missingRes.error.code });
    }
    bodyDirectory = [...accreditingBodies, ...(missingRes.data ?? [])];
  }
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

  // ---- Readiness strip (IA spec, Events section) ---------------------------
  // Five facts, each with a state. Anything we cannot actually check renders
  // `idle` (muted) rather than green — asserting readiness we have not verified
  // is exactly what this strip exists to prevent.
  const capacityLabel = event.max_attendees != null ? `${regs.length}/${event.max_attendees}` : `${regs.length}`;
  const fillPct = event.max_attendees ? regs.length / event.max_attendees : null;
  // Resolve the body to a REAL name. A config row alone is not accreditation:
  // if the id does not resolve against the organisation's authorised bodies,
  // the event carries points nobody has agreed to honour, and the strip must
  // say so rather than print a placeholder and a green "confirmed".
  const configuredBody = accreditingBodies.find((b) => b.id === event.accrediting_body_id);
  const hasConfig = event.accrediting_body_id != null && event.cpd_hours != null;
  const singleBodyAccredited = hasConfig && configuredBody != null;
  // A real config built via the wizard (event_accreditation_groups) is
  // equally "accredited" — its bodies were validated at add time by
  // add_event_accreditation_group, so no separate not-authorised check is
  // needed the way the legacy scalar columns require one.
  const multiBodyAccredited = multiBodyConfigured;
  const accredited = singleBodyAccredited || multiBodyAccredited;

  const readiness: ReadinessCell[] = [
    {
      label: 'registered',
      value: capacityLabel,
      state: fillPct == null ? 'idle' : fillPct >= 0.9 ? 'ok' : fillPct >= 0.4 ? 'warn' : 'blocked',
      note:
        fillPct == null ? 'no capacity set'
        : fillPct >= 0.9 ? 'on pace'
        : `${Math.round(fillPct * 100)}% full`,
    },
    {
      label: 'programme',
      value: `${blocks.length}`,
      state: blocks.length > 0 ? 'ok' : 'warn',
      note: blocks.length > 0 ? 'agenda blocks set' : 'no agenda yet',
    },
    {
      label: 'accreditation',
      value: multiBodyAccredited
        ? `${wizardGroups.length} ${wizardGroups.length === 1 ? 'body' : 'bodies'}`
        : singleBodyAccredited ? `${configuredBody.short_name} ${event.cpd_hours}`
        : hasConfig ? 'Unverified'
        : 'Not set',
      state: accredited ? 'ok' : hasConfig ? 'blocked' : 'warn',
      note: multiBodyAccredited
        ? 'via multi-body accreditation'
        : singleBodyAccredited ? 'hours confirmed'
        : hasConfig ? 'body not authorised for this org'
        : 'no body or hours',
    },
    {
      label: 'passes sent',
      value: `${confirmationsSent}`,
      state: confirmationsSent > 0 ? 'ok' : regs.length === 0 ? 'idle' : 'warn',
      note:
        regs.length === 0 ? 'nobody registered'
        : confirmationsSent >= regs.length ? 'all registrants'
        : `${regs.length - confirmationsSent} outstanding`,
    },
    {
      label: 'survey',
      value: responseCount > 0 ? `${responseCount}` : 'Armed',
      state: responseCount > 0 ? 'ok' : 'idle',
      note: responseCount > 0 ? 'responses in' : 'fires 10 min after end',
    },
  ];

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lifecycle = computeLifecycle(event as EventLifecycleRow, nowMs);
  // Lock policy (locked 2026-06-19): structural fields freeze once published.
  const structuralLocked = lifecycle !== 'drafted' && lifecycle !== 'cancelled';

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboardIcon },
          { label: event.title, icon: CalendarDaysIcon },
        ]}
        className="mb-sm"
      />

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
            <h1 className="text-[calc(30px*var(--text-scale))] leading-[1.1] font-extrabold tracking-[-0.025em] text-on-surface">{event.title}</h1>
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

      {/* "One glance = is this event ready to run" (IA spec). */}
      <ReadinessStrip cells={readiness} />

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

      <CpdAccreditationSection
        eventId={event.id}
        startTime={event.start_time}
        endTime={event.end_time}
        bodies={accreditingBodies}
        currentBodyId={event.accrediting_body_id}
        currentHours={event.cpd_hours}
        multiBodyConfigured={multiBodyConfigured}
        creditsIssued={creditsIssued}
        bodiesUnavailable={bodiesUnavailable}
        noAuthorisedBodies={noAuthorisedBodies}
      />

      <MultiBodyAccreditationWizard
        eventId={event.id}
        bodies={accreditingBodies}
        bodyDirectory={bodyDirectory}
        occurrences={wizardOccurrences}
        initialGroups={wizardGroups}
        frozen={creditsIssued > 0}
      />

      {/* Task 10.7 evidence export — one section per row Step 6 spec, mounted
          next to the accreditation surfaces because the export IS the
          hand-over of what those surfaces produced. Owner-or-eventar_staff
          gate mirrors the confirmations/delivery panels; button disables
          when nothing is on the ledger yet. */}
      {canSeeConfirmationsSent && (
        <section
          aria-labelledby="evidence-export-heading"
          className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg mt-lg"
        >
          <h2 id="evidence-export-heading" className="text-title-md font-semibold text-on-surface mb-xs">
            Evidence export
          </h2>
          <p className="text-body-sm text-on-surface-variant mb-md">
            Downloads the Q2 participation claims (JSON) plus a flat one-row-per-credit CSV. Each package
            carries an RFC 8785 canonical hash of the accrediting body&rsquo;s current rule pack, so a
            reader can pin the export to the pack version it was generated against.
          </p>
          <EvidenceExportButton eventId={event.id} disabled={creditsIssued === 0} />
        </section>
      )}

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

      {canSeeConfirmationsSent && (
        <PassDeliveryPanel
          registrations={regs
            .filter((r) => r.status === 'registered')
            .map((r) => ({ id: r.id, full_name: r.full_name }))}
          logRows={deliveryRows}
          // The pass goes out when check-in opens; before that, "not sent" is
          // expected rather than a problem worth flagging.
          windowOpen={lifecycle === 'live' || lifecycle === 'completed'}
          // Same env switch the send core uses to pick devEmailStub. Without
          // it every local run reports the whole roster as pass-less, because
          // the stub leaves rows 'queued' by design.
          deliveryLive={Boolean(process.env.RESEND_API_KEY)}
        />
      )}

      {/* Playbook item 4: raw email_log aggregate across all three purposes,
          with live/stubbed indicator. Same owner-or-eventar_staff gate as the
          sibling delivery panels. */}
      {canSeeConfirmationsSent && (
        <EmailDeliveryStrip
          rows={deliveryAggRows}
          deliveryLive={Boolean(process.env.RESEND_API_KEY)}
        />
      )}

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
      className="material-symbols-outlined text-[calc(14px*var(--text-scale))] text-on-surface-variant align-middle"
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
        <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>edit</span>Edit
      </Link>
      {showRoster && (
        <Link href={`/events/${eventId}/checkin`} className={lifecycle === 'live' ? live : outline}>
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>group</span>Roster
        </Link>
      )}
      {showPublic && (
        <Link href={`/events/${eventId}`} target="_blank" rel="noreferrer" className={outline}>
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>open_in_new</span>Public
        </Link>
      )}
      {canAnalytics ? (
        <Link href={`/events/${eventId}/analytics`} className={outline}>
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>insights</span>Analytics
        </Link>
      ) : (
        <span className={`${base} border-outline-variant text-on-surface-variant opacity-50 cursor-not-allowed`} title="Available after the event completes">
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>insights</span>Analytics
        </span>
      )}
    </div>
  );
}
