import { TileShell } from './TileShell';

type Counts = { drafted: number; registering: number; upcoming: number; live: number; completed: number };

const SEGMENT_COLORS: Record<keyof Counts, string> = {
  drafted: 'bg-surface-container-high',
  registering: 'bg-primary-container',
  upcoming: 'bg-primary-fixed',
  live: 'bg-error',
  completed: 'bg-secondary-fixed',
};
const ABBR: Record<keyof Counts, string> = { drafted: 'D', registering: 'R', upcoming: 'U', live: 'L', completed: 'C' };

export function EventsByStatusTile({ counts }: { counts: Counts }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const keys = ['drafted', 'registering', 'upcoming', 'live', 'completed'] as const;

  return (
    <TileShell label="By Status" icon="dashboard">
      <p className="font-display text-display text-on-surface mb-xs">{total}</p>
      <div className="w-full h-2 rounded-full overflow-hidden flex mb-sm border border-outline-variant bg-surface-container-high">
        {keys.map((k) => {
          const pct = total > 0 ? (counts[k] / total) * 100 : 0;
          if (pct === 0) return null;
          return <div key={k} className={SEGMENT_COLORS[k]} style={{ width: `${pct}%` }} aria-label={`${k} ${counts[k]}`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-md gap-y-xs text-[10px] font-label-md font-semibold text-on-surface-variant">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${SEGMENT_COLORS[k]} ${k === 'upcoming' ? 'border border-outline' : ''}`} />
            {ABBR[k]} {counts[k]}
          </span>
        ))}
      </div>
    </TileShell>
  );
}
