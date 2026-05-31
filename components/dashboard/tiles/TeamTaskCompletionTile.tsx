import { TileShell } from './TileShell';

export function TeamTaskCompletionTile({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : null;
  return (
    <TileShell label="Your Events" icon="task_alt">
      <p className="font-display text-display text-on-surface mb-xs">{pct == null ? '—' : `${pct}%`}</p>
      {pct != null && (
        <div className="w-full bg-surface-container-highest h-2 rounded-full mt-sm overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="font-label-md text-label-md text-on-surface-variant mt-xs">
        {total === 0 ? 'No events yet' : `${completed} of ${total} completed`}
      </p>
    </TileShell>
  );
}
