import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

export function BarDistributionSlice({
  icon,
  iconBg,
  title,
  prompt,
  distribution,
  layout,
  family = 'blue',
  priorityPill,
  sliceBgClass,
  borderBottom = true,
  caption,
}: {
  icon: string;
  iconBg: 'fixed' | 'tertiary-fixed' | 'primary';
  title: string;
  prompt: string;
  distribution: Distribution[];
  layout: 'grid' | 'stack';
  // Chart color rule (locked): ONE color family per question — saturated for
  // the leading response, light tint for the rest. Blue = standard questions,
  // green = sentiment (Q4). Never mix families within a question.
  family?: 'blue' | 'green';
  priorityPill?: string; // e.g. "Priority Expansion"
  sliceBgClass?: string;
  borderBottom?: boolean;
  caption?: string;
}) {
  const topSlug = distribution[0]?.slug;
  const strong = family === 'green' ? 'bg-[color:var(--success)]' : 'bg-[color:var(--on-primary-container)]';
  const tint = family === 'green' ? 'bg-[color:var(--success)]/35' : 'bg-[color:var(--on-primary-container)]/35';
  const strongText = family === 'green' ? 'text-[color:var(--success)]' : 'text-[color:var(--on-primary-container)]';

  const bars = distribution.map((d) => {
    const isWinner = d.slug === topSlug;
    // E.5 winner-row emphasis: top row gets full accent fill, the rest get
    // accent @ 45%. Replaces the older primary-container fallback so the
    // distribution-bars share a single accent ramp across Q1/Q3/Q5/Q2.
    return (
      <div key={d.slug} className="space-y-[3px]">
        <div className={`flex justify-between text-[12px] font-semibold tabular-nums ${isWinner ? strongText : 'text-on-surface-variant'}`}>
          <span className="truncate pr-sm">{d.label}</span>
          <span>{d.pct}%</span>
        </div>
        <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
          <div
            className={`h-full ${isWinner ? strong : tint}`}
            style={{ width: `${d.pct}%` }}
          />
        </div>
      </div>
    );
  });

  return (
    <Slice icon={icon} iconBg={iconBg} title={title} prompt={prompt} bgClass={sliceBgClass} borderBottom={borderBottom}>
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-x-xl gap-y-sm flex-grow' : 'flex-grow space-y-sm'}>
        {bars}
        {caption && (
          <p className="text-[11px] italic text-on-surface-variant mt-xs">{caption}</p>
        )}
      </div>
      {priorityPill && (
        <span className="hidden lg:block bg-secondary-container text-on-secondary-container px-md py-xs rounded-full text-label-md font-label-md flex-shrink-0 whitespace-nowrap">
          {priorityPill}
        </span>
      )}
    </Slice>
  );
}
