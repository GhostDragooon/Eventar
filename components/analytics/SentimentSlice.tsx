import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

type Q4Slug = 'exceeded' | 'met' | 'partially' | 'not_met';

// E.5 plan: sequential accent opacities for the 100% stacked bar. Order
// matches EXPECTATIONS_OPTIONS (exceeded → met → partially → not_met) so the
// visual ramp tracks the semantic ramp (best → worst).
const SLUG_ORDER: Q4Slug[] = ['exceeded', 'met', 'partially', 'not_met'];
const SLUG_OPACITY: Record<Q4Slug, number> = {
  exceeded: 1.0,
  met: 0.7,
  partially: 0.4,
  not_met: 0.18,
};
const SLUG_LABEL: Record<Q4Slug, string> = {
  exceeded: 'Exceeded',
  met: 'Met',
  partially: 'Partially',
  not_met: 'Not Met',
};

export function SentimentSlice({
  happyRate,
  distribution,
}: {
  happyRate: number | null;
  distribution: Distribution[];
}) {
  const pctBySlug = new Map(distribution.map((d) => [d.slug, d.pct]));
  const findPct = (slug: Q4Slug) => pctBySlug.get(slug) ?? 0;

  return (
    <Slice
      icon="favorite"
      iconBg="primary-container"
      title="Sentiment (Q4)"
      prompt={'"Did this event meet your expectations?"'}
    >
      <div className="flex items-center gap-md flex-shrink-0">
        <span className="text-display font-bold text-primary leading-none">
          {happyRate == null ? '—' : `${Math.round(happyRate * 100)}%`}
        </span>
        <div className="text-label-md font-bold text-on-surface-variant leading-tight">
          Met/Exceeded
          <br />
          Expectations
        </div>
      </div>
      {happyRate == null ? (
        <div className="flex-grow flex items-center">
          <p className="text-body-md text-on-surface-variant italic">
            No sentiment data yet — Q4 hasn&apos;t been answered.
          </p>
        </div>
      ) : (
        <div className="flex-grow flex flex-col gap-sm">
          {/* Sentiment strip: at-a-glance happy rate. */}
          <div
            className="h-6 w-full bg-surface-container-high rounded-full overflow-hidden"
            role="presentation"
          >
            <div
              className="h-full bg-[color:var(--success)] rounded-full"
              style={{ width: `${Math.round(happyRate * 100)}%` }}
            />
          </div>
          {/* 100% stacked bar — one segment per Q4 option, sequential accent
              opacity per E.5 plan. Replaces the older per-row distribution
              bars; segments < 4% are still rendered so the legend stays
              one-to-one with bar segments. */}
          <div
            className="h-3 w-full rounded-full overflow-hidden flex"
            role="img"
            aria-label="Expectation distribution stacked bar"
          >
            {SLUG_ORDER.map((slug) => {
              const pct = findPct(slug);
              if (pct === 0) return null;
              return (
                <div
                  key={slug}
                  className="h-full bg-[color:var(--success)]"
                  style={{ width: `${pct}%`, opacity: SLUG_OPACITY[slug] }}
                  title={`${SLUG_LABEL[slug]} ${pct}%`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-md">
            {SLUG_ORDER.map((slug) => (
              <div key={slug} className="text-[11px] flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-sm bg-[color:var(--success)]"
                  style={{ opacity: SLUG_OPACITY[slug] }}
                  aria-hidden
                />
                <span className="text-on-surface-variant">
                  {SLUG_LABEL[slug]} ({findPct(slug)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Slice>
  );
}
