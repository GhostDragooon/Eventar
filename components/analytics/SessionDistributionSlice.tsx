import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

/**
 * E.5 Q2 "Most valuable session" distribution. Labels are long
 * ("{block title} · {speaker}") so a stack layout works better than the
 * Q1/Q3 grid; otherwise mirrors BarDistributionSlice's winner-emphasis rule
 * (top row 100% accent, rest @ 45%).
 */
export function SessionDistributionSlice({
  distribution,
  emptyHint,
}: {
  distribution: Distribution[];
  emptyHint?: string;
}) {
  const topSlug = distribution[0]?.slug;

  return (
    <Slice
      icon="event_seat"
      iconBg="secondary-container"
      title="Most valuable session (Q2)"
      prompt={'"Which session was most valuable to you?"'}
    >
      {distribution.length === 0 ? (
        <p className="flex-grow text-body-md text-on-surface-variant italic">
          {emptyHint ?? 'No Q2 answers yet — nothing to rank.'}
        </p>
      ) : (
        <div className="flex-grow flex-col space-y-sm w-full">
          {distribution.map((d) => {
            const isWinner = d.slug === topSlug;
            return (
              <div key={d.slug} className="space-y-xs">
                <div
                  className={`flex justify-between text-label-md font-bold gap-md ${
                    isWinner ? 'text-[color:var(--on-primary-container)]' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="truncate" title={d.label}>{d.label}</span>
                  <span className="flex-shrink-0">{d.pct}%</span>
                </div>
                <div
                  className={`h-2 w-full bg-surface-container-high rounded-full overflow-hidden ${
                    isWinner ? 'border border-primary/20' : ''
                  }`}
                >
                  <div
                    className={`h-full ${isWinner ? 'bg-[color:var(--on-primary-container)]' : 'bg-[color:var(--on-primary-container)]/35'}`}
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Slice>
  );
}
