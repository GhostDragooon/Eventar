import Link from 'next/link';
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
import { BarDistributionSlice } from '@/components/analytics/BarDistributionSlice';
import { HighlightCommentSlice } from '@/components/analytics/HighlightCommentSlice';
import { SentimentSlice } from '@/components/analytics/SentimentSlice';
import { OperationalInsightCard } from '@/components/analytics/OperationalInsightCard';
import { KeyMetricAnalysisCard } from '@/components/analytics/KeyMetricAnalysisCard';

type SurveyRow = {
  id: string;
  session_format: string | null;
  key_highlights: string | null;
  value_proposition: string | null;
  expectations: string | null;
  future_preferences: string[];
  submitted_at: string;
};

type RegRow = {
  id: string;
  status: string;
  check_in_at: string | null;
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
  const [eventRes, regsRes, surveysRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('registrations').select('id, status, check_in_at').eq('event_id', id),
    supabase
      .from('survey_responses')
      .select('id, session_format, key_highlights, value_proposition, expectations, future_preferences, submitted_at')
      .eq('event_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;

  const event = eventRes.data;
  const regs = (regsRes.data ?? []) as RegRow[];
  const surveys = (surveysRes.data ?? []) as SurveyRow[];

  const registered = regs.length;
  const attended = regs.filter((r) => r.status === 'attended').length;
  const showUpRate = registered > 0 ? attended / registered : 0;
  const responseRate = attended > 0 ? surveys.length / attended : 0;

  const q1 = countBySlug(surveys, 'session_format', Q1_LABELS);
  const q3 = countBySlug(surveys, 'value_proposition', Q3_LABELS);
  const q4 = countBySlug(surveys, 'expectations', Q4_LABELS);
  const q5 = countBySlugMulti(surveys, 'future_preferences', Q5_LABELS);
  const hr = happyRate(surveys, 'expectations');

  const commentRows = surveys.filter((s) => s.key_highlights != null && s.key_highlights.trim() !== '');
  const latest = commentRows[0];
  const latestQuote = latest?.key_highlights?.trim() ?? null;
  const latestQuoteAgo = latest ? timeAgo(latest.submitted_at) : null;

  const metrics = { showUpRate, happyRate: hr, responseRate };

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="mb-lg flex flex-col md:flex-row justify-between items-end gap-md">
        <div className="max-w-3xl">
          <Link
            href={`/events/${event.id}/edit`}
            className="text-label-md font-label-md text-primary tracking-widest uppercase mb-xs block hover:underline"
          >
            ← Organizer Portal
          </Link>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-xs leading-tight">
            Post-Event Survey Analytics: {event.title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Multi-channel member feedback and operational analytics summary.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="flex items-center gap-sm bg-surface-container-high text-on-surface px-lg py-sm rounded-lg font-bold border border-outline-variant opacity-60 cursor-not-allowed text-sm"
          aria-label="Export PDF (not yet available)"
          title="Export PDF — coming soon"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden>
            download
          </span>
          Export PDF
        </button>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm overflow-hidden">
        <BarDistributionSlice
          icon="event_note"
          iconBg="fixed"
          title="Agenda (Q1)"
          prompt={'"Which event format did you find most valuable?"'}
          distribution={q1}
          layout="grid"
          priorityPill="Priority Expansion"
        />
        <HighlightCommentSlice
          latestQuote={latestQuote}
          latestQuoteAgo={latestQuoteAgo}
          totalComments={commentRows.length}
        />
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
