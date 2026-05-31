import { TileShell } from './TileShell';

export function AggregateRegistrationTile({ total }: { total: number }) {
  return (
    <TileShell label="Registration" icon="groups">
      <p className="font-display text-display text-on-surface mb-xs">{total}</p>
      <p className="font-label-md text-label-md text-on-surface-variant">across upcoming events</p>
    </TileShell>
  );
}
