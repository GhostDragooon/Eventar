import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

export function BarDistributionSlice({
  icon,
  iconBg,
  title,
  prompt,
  distribution,
  layout,
  priorityPill,
  sliceBgClass,
  borderBottom = true,
}: {
  icon: string;
  iconBg: 'fixed' | 'tertiary-fixed' | 'primary';
  title: string;
  prompt: string;
  distribution: Distribution[];
  layout: 'grid' | 'stack';
  priorityPill?: string; // e.g. "Priority Expansion"
  sliceBgClass?: string;
  borderBottom?: boolean;
}) {
  const topSlug = distribution[0]?.slug;

  const bars = distribution.map((d) => {
    const isWinner = d.slug === topSlug;
    return (
      <div key={d.slug} className="space-y-xs">
        <div className={`flex justify-between text-label-md font-bold ${isWinner ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span>{d.label}</span>
          <span>{d.pct}%</span>
        </div>
        <div className={`h-2 w-full bg-surface-container-high rounded-full overflow-hidden ${isWinner ? 'border border-primary/20' : ''}`}>
          <div
            className={`h-full ${isWinner ? 'bg-primary' : 'bg-primary-container'}`}
            style={{ width: `${d.pct}%` }}
          />
        </div>
      </div>
    );
  });

  return (
    <Slice icon={icon} iconBg={iconBg} title={title} prompt={prompt} bgClass={sliceBgClass} borderBottom={borderBottom}>
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-x-xl gap-y-md flex-grow' : 'flex-grow space-y-sm'}>
        {bars}
      </div>
      {priorityPill && (
        <span className="hidden lg:block bg-secondary-container text-on-secondary-container px-md py-xs rounded-full text-label-md font-label-md flex-shrink-0 whitespace-nowrap">
          {priorityPill}
        </span>
      )}
    </Slice>
  );
}
