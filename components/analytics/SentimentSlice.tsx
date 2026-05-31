import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

type Q4Slug = 'exceeded' | 'met' | 'partially' | 'not_met';

const SLUG_COLOR: Record<Q4Slug, string> = {
  exceeded: 'bg-primary',
  met: 'bg-primary-container',
  partially: 'bg-outline-variant',
  not_met: 'bg-error',
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
  const findPct = (slug: Q4Slug) => distribution.find((d) => d.slug === slug)?.pct ?? 0;

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
        <div className="flex-grow flex items-center gap-sm">
          <div className="h-6 flex-grow bg-surface-container-high rounded-full overflow-hidden relative">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.round(happyRate * 100)}%` }}
            />
          </div>
          <div className="flex justify-between gap-md flex-wrap">
            {(['exceeded', 'met', 'partially', 'not_met'] as Q4Slug[]).map((slug) => (
              <div key={slug} className="text-[10px] flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${SLUG_COLOR[slug]}`} />
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
