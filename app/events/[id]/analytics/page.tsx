import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import {
  SESSION_FORMAT_OPTIONS,
  VALUE_PROPOSITION_OPTIONS,
  EXPECTATIONS_OPTIONS,
  FUTURE_PREFERENCE_OPTIONS,
} from '@/lib/surveyTemplate';
import { countBySlug } from '@/lib/analytics/countBySlug';
import { countBySlugMulti } from '@/lib/analytics/countBySlugMulti';
import { happyRate } from '@/lib/analytics/happyRate';
import { sessionDistribution } from '@/lib/analytics/sessionDistribution';
import { BarDistributionSlice } from '@/components/analytics/BarDistributionSlice';
import { SentimentSlice } from '@/components/analytics/SentimentSlice';
import { SessionDistributionSlice } from '@/components/analytics/SessionDistributionSlice';
import { RingGauge } from '@/components/analytics/RingGauge';
import { FunnelCard } from '@/components/analytics/FunnelCard';
import { OperationalInsightCard } from '@/components/analytics/OperationalInsightCard';
import { KeyMetricAnalysisCard } from '@/components/analytics/KeyMetricAnalysisCard';

type SurveyRow = {
  id: string;
  session_format: string | null;
  value_proposition: string | null;
  expectations: string | null;
  future_preferences: string[];
  valuable_block_id: string | null;
  valuable_overall: boolean | null;
  submitted_at: string;
};

type RegRow = {
  id: string;
  status: string;
  check_in_at: string | null;
};

type AgendaBlockRow = {
  id: string;
  title: string;
  host: string | null;
  topics: unknown;
};

const optionsToLabels = (opts: readonly { value: string; label: string }[]) =>
  Object.fromEntries(opts.map((o) => [o.value, o.label]));

const Q1_LABELS = optionsToLabels(SESSION_FORMAT_OPTIONS);
const Q3_LABELS = optionsToLabels(VALUE_PROPOSITION_OPTIONS);
const Q4_LABELS = optionsToLabels(EXPECTATIONS_OPTIONS);
const Q5_LABELS = optionsToLabels(FUTURE_PREFERENCE_OPTIONS);

export default async function EventAnalyticsPage({
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
  const [eventRes, regsRes, surveysRes, blocksRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('registrations').select('id, status, check_in_at').eq('event_id', id),
    supabase
      .from('survey_responses')
      .select(
        'id, session_format, value_proposition, expectations, future_preferences, valuable_block_id, valuable_overall, submitted_at',
      )
      .eq('event_id', id)
      .order('submitted_at', { ascending: false }),
    // E.5 Q2 distribution: blocks needed to label valuable_block_id rows. No
    // kind filter — deleted/break/transition blocks are dropped by the
    // aggregator if they show up in the answer set (defensive).
    supabase.from('agenda_blocks').select('id, title, host, topics').eq('event_id', id),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;
  if (blocksRes.error) throw blocksRes.error;

  const event = eventRes.data;
  const regs = (regsRes.data ?? []) as RegRow[];
  const surveys = (surveysRes.data ?? []) as SurveyRow[];
  const blocks = (blocksRes.data ?? []) as AgendaBlockRow[];

  const registered = regs.length;
  const attended = regs.filter((r) => r.status === 'attended').length;
  const responded = surveys.length;
  const showUpRate = registered > 0 ? attended / registered : 0;
  const responseRate = attended > 0 ? responded / attended : 0;

  const q1 = countBySlug(surveys, 'session_format', Q1_LABELS);
  const q2 = sessionDistribution(surveys, blocks);
  const q3 = countBySlug(surveys, 'value_proposition', Q3_LABELS);
  const q4 = countBySlug(surveys, 'expectations', Q4_LABELS);
  const q5 = countBySlugMulti(surveys, 'future_preferences', Q5_LABELS);
  const hr = happyRate(surveys, 'expectations');

  const metrics = { showUpRate, happyRate: hr, responseRate };

  // AN-2 meta line — verbatim shape from the mockup, derived from real counts.
  const heroMeta = `${attended} of ${registered} registered attended · ${responded} of ${attended} responded${
    attended > 0 ? ` (${Math.round(responseRate * 100)}%)` : ''
  }`;

  return (
    <StaffShell
      staff={{ email: staff.email, role: staff.role }}
      backHref={`/events/${id}/details`}
      backLabel="Event"
    >
      <header className="mb-lg">
        <div className="max-w-3xl">
          <h1 className="font-headline-lg text-headline-lg text-primary mb-xs leading-tight">
            Post-Event Survey Analytics: {event.title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{heroMeta}</p>
        </div>
      </header>

      {/* Headline block — ring gauges on accent-on-surface-high track. Each
          ring's max is the previous stage in the funnel; the centre numeric
          is the raw count. The plan keeps the AN-3 three-card vibe but adds
          the ring as the dominant visual. */}
      <section
        aria-label="Headline metrics"
        className="mb-lg p-lg bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-lg"
      >
        <RingGauge
          label="Registered"
          value={registered}
          max={event.max_attendees ?? Math.max(registered, 1)}
          displayValue={String(registered)}
          caption={
            event.max_attendees
              ? `of ${event.max_attendees} cap`
              : registered > 0
              ? 'no cap set'
              : undefined
          }
        />
        <RingGauge
          label="Attended"
          value={attended}
          max={registered > 0 ? registered : 1}
          displayValue={String(attended)}
          caption={registered > 0 ? `${Math.round(showUpRate * 100)}% turnout` : undefined}
        />
        <RingGauge
          label="Survey"
          value={responded}
          max={attended > 0 ? attended : 1}
          displayValue={String(responded)}
          caption={attended > 0 ? `${Math.round(responseRate * 100)}% response` : undefined}
        />
      </section>

      <FunnelCard registered={registered} attended={attended} responded={responded} />

      <div className="mt-lg bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm overflow-hidden">
        <BarDistributionSlice
          icon="event_note"
          iconBg="fixed"
          title="Agenda (Q1)"
          prompt={'"Which event format did you find most valuable?"'}
          distribution={q1}
          layout="grid"
          priorityPill="Priority Expansion"
        />
        {/* E.5 Q2 — replaces the dead HighlightCommentSlice. Counts
            valuable_block_id + valuable_overall and labels with block title +
            speaker. */}
        <SessionDistributionSlice distribution={q2} />
        <BarDistributionSlice
          icon="insights"
          iconBg="tertiary-fixed"
          title="Value Drivers (Q3)"
          prompt={'"What was the most valuable aspect of this summit?"'}
          distribution={q3}
          layout="grid"
        />
        <SentimentSlice happyRate={hr} distribution={q4} />
        <BarDistributionSlice
          icon="chat"
          iconBg="primary"
          title="Requests (Q5)"
          prompt={'"Select areas for future programmatic expansion:"'}
          distribution={q5}
          layout="stack"
          sliceBgClass="bg-primary/5"
          borderBottom={false}
          caption="Multi-select — percentages are % of respondents who picked each, may sum above 100%."
        />
      </div>

      <OperationalInsightCard metrics={metrics} />
      <KeyMetricAnalysisCard metrics={metrics} />
    </StaffShell>
  );
}
