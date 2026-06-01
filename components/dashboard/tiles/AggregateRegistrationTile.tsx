import { TileShell } from './TileShell';

export function AggregateRegistrationTile({
  total,
  upcomingCount,
}: {
  total: number;
  upcomingCount: number;
}) {
  if (upcomingCount === 0) {
    return (
      <TileShell label="Registration" icon="groups">
        <p className="font-display text-display text-on-surface-variant/40 mb-xs">—</p>
        <p className="font-label-md text-label-md text-on-surface-variant">No upcoming events</p>
      </TileShell>
    );
  }
  return (
    <TileShell label="Registration" icon="groups">
      <p className="font-display text-display text-on-surface mb-xs">{total}</p>
      <p className="font-label-md text-label-md text-on-surface-variant">
        across {upcomingCount} upcoming event{upcomingCount === 1 ? '' : 's'}
      </p>
    </TileShell>
  );
}
