import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { rateLimitByIp } from '@/lib/rateLimit';
import { isSessionBlockKind, type AgendaTopic } from '@/lib/agenda';
import { firstName } from '@/lib/name';
import { PublicShell } from '@/components/shell/PublicShell';
import SurveyForm from './SurveyForm';

export const metadata = {
  title: 'Event survey',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="quiz"
            title="No survey code"
            body="Open this page from the survey link we emailed you, or scan your personal QR code. If you can't find it, ask the event organiser for help."
          />
        </PageWrap>
      </PublicShell>
    );
  }
  if (!isValidRegistrationCode(code)) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please use the survey link we emailed you, or ask the event organiser for help."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // Enumeration defense: cap per-IP page loads before the admin lookup runs.
  const limit = await rateLimitByIp('surveyGet', { windowMs: 60_000, max: 60 });
  if (!limit.allowed) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="hourglass_empty"
            title="Too many requests"
            body="Please slow down and try again in a moment."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  const admin = supabaseAdmin();
  // The select string with !inner embed confuses supabase-js's generic
  // inference and the row gets typed as GenericStringError. Cast to the
  // shape we actually request — small and contained (same pattern as
  // confirm/page.tsx RegRow).
  type EventEmbed = {
    id: string;
    title: string;
    status: string;
    start_time: string;
    timezone: string;
    venue_name: string;
  };
  type RegRow = {
    id: string;
    status: string;
    full_name: string;
    events: EventEmbed | Array<EventEmbed> | null;
  };
  const { data: reg } = (await admin
    .from('registrations')
    .select('id, status, full_name, events!inner(id, title, status, start_time, timezone, venue_name)')
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null };

  if (!reg || !reg.events) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please use the survey link we emailed you, or ask the event organiser for help."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // The supabase-js typing for embedded selects can return the relation as
  // an object OR an array depending on relationship cardinality.
  // registrations.event_id -> events.id is many-to-one, so it's always an
  // object here, but TS doesn't know that. Narrow:
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please use the survey link we emailed you, or ask the event organiser for help."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  if (reg.status !== 'attended') {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="hourglass_empty"
            title="Survey not available yet"
            body="This survey opens once you've been checked in at the event. If you've already attended, please ask the organiser."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // Already submitted? (idempotent UX — the DB unique constraint is the real
  // guard; this just avoids showing the form a second time.)
  const { data: existing } = await admin
    .from('survey_responses')
    .select('id')
    .eq('registration_id', reg.id)
    .maybeSingle();
  if (existing) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="check_circle"
            title="Thanks — already submitted"
            body={`We've already recorded your feedback for ${event.title}.`}
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // Q2 (G1) options come from the event's schedule. Breaks/transitions are not
  // "sessions", so they don't become options; SurveyForm appends the
  // "General sessions / overall" fallback, which is all that renders for
  // events with no agenda blocks.
  type BlockRow = { id: string; kind: string; title: string; topics: AgendaTopic[] };
  const { data: blocks, error: blocksErr } = (await admin
    .from('agenda_blocks')
    .select('id, kind, title, topics')
    .eq('event_id', event.id)
    .order('start_time', { ascending: true })) as {
    data: BlockRow[] | null;
    error: { code?: string; message?: string } | null;
  };
  if (blocksErr) {
    // Fail visibly (Rule 12): without this log, a failed fetch renders the
    // general-only fallback indistinguishably from a no-schedule event.
    // Log only code + message — PG `details` can echo row data (Rule 10).
    console.error('[survey] agenda blocks fetch failed', {
      code: blocksErr.code,
      message: blocksErr.message,
    });
  }
  const sessionOptions = (blocks ?? [])
    .filter((b) => isSessionBlockKind(b.kind))
    .map((b) => {
      const speaker = b.topics?.[0]?.speaker_name?.trim();
      return { value: b.id, label: speaker ? `${b.title} · ${speaker}` : b.title };
    });

  // First name for the intro line. lib/name.ts::firstName handles padded /
  // empty / single-token / hyphenated cases consistently across surfaces
  // (also used by the dashboard greeting).
  const firstNameStr = firstName(reg.full_name);

  return (
    <PublicShell>
      <SurveyForm
        code={code}
        eventTitle={event.title}
        eventStartTime={event.start_time}
        eventTimezone={event.timezone}
        eventVenueName={event.venue_name}
        firstName={firstNameStr}
        sessionOptions={sessionOptions}
      />
    </PublicShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto px-grid-margin py-lg space-y-md">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="text-center space-y-sm">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary-container text-on-secondary-container rounded-full mb-sm" aria-hidden>
        <span className="material-symbols-outlined text-[32px]">{icon}</span>
      </div>
      <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mx-auto">
        {body}
      </p>
    </div>
  );
}
