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
import { ExportAnalyticsCsv } from '@/components/analytics/ExportAnalyticsCsv';

export const metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false },
};

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
      <header className="mb-lg flex flex-col md:flex-row md:items-start md:justify-between gap-md">
        <div className="max-w-3xl min-w-0">
          {/* Function-leads eyebrow (locked naming rule). */}
          <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">
            Analytics
          </p>
          <h1 className="text-[30px] leading-[1.15] font-extrabold tracking-[-0.025em] text-on-surface mb-xs">
            {event.title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{heroMeta}</p>
        </div>
        <ExportAnalyticsCsv
          eventTitle={event.title}
          funnel={{ registered, attended, responded }}
          questions={[
            { id: 'Q1', prompt: 'Most valuable format', distribution: q1 },
            { id: 'Q2', prompt: 'Most valuable session', distribution: q2 },
            { id: 'Q3', prompt: 'Most valuable aspect', distribution: q3 },
            { id: 'Q4', prompt: 'Expectations', distribution: q4 },
            { id: 'Q5', prompt: 'Future preferences', distribution: q5 },
          ]}
        />
      </header>

      {/* Dark "Outcome" band (AN v2) — the page's one dark moment: three
          headline percentages. Green = attendance + sentiment (direction),
          blue = response (action/participation). */}
      <section
        aria-label="Outcome"
        className="mb-lg rounded-[20px] p-lg text-white"
        style={{ background: 'radial-gradient(120% 140% at 0% 0%, #123420 0%, #0A0A0A 55%)' }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 mb-md">Outcome</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
          <OutcomeStat pct={Math.round(showUpRate * 100)} label="Attendance" sub={`${attended} of ${registered}`} tone="green" />
          <OutcomeStat pct={Math.round(responseRate * 100)} label="Response" sub={`${responded} of ${attended}`} tone="blue" />
          {/* hr is null until at least one Q4 answer exists. */}
          <OutcomeStat pct={hr == null ? 0 : Math.round(hr * 100)} label="Met / exceeded" sub={hr == null ? 'no answers yet' : 'expectations'} tone="green" />
        </div>
      </section>

      {/* §01 Funnel — ring gauges. Each ring's max is the previous stage in
          the funnel; the centre numeric is the raw count. */}
      <div className="flex items-center gap-sm mb-md">
        <span className="inline-flex items-center justify-center w-[30px] h-[22px] rounded-md text-[11px] font-bold tabular-nums bg-primary-container text-on-primary-container" aria-hidden>01</span>
        <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-on-surface">Funnel</h2>
      </div>
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

      {/* §02 Feedback — per-question distributions, one color family each. */}
      <div className="flex items-center gap-sm mt-lg mb-md">
        <span className="inline-flex items-center justify-center w-[30px] h-[22px] rounded-md text-[11px] font-bold tabular-nums bg-primary-container text-on-primary-container" aria-hidden>02</span>
        <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-on-surface">Feedback</h2>
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm overflow-hidden">
        <BarDistributionSlice
          icon="event_note"
          iconBg="fixed"
          title="Agenda (Q1)"
          prompt={'"Which event format did you find most valuable?"'}
          distribution={q1}
          layout="stack"
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
          layout="stack"
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

function OutcomeStat({ pct, label, sub, tone }: { pct: number; label: string; sub: string; tone: 'green' | 'blue' }) {
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.03] p-md">
      <p className="leading-none mb-sm">
        <span className={`text-[34px] font-extrabold tracking-[-0.02em] tabular-nums ${tone === 'green' ? 'text-[#4ADE80]' : 'text-[#79B8FF]'}`}>
          {pct}%
        </span>
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}
        <span className="text-white/30"> · {sub}</span>
      </p>
    </div>
  );
}
