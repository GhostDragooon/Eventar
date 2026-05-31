import { TileShell } from './TileShell';

export function DaysUntilTile({ days, eventTitle }: { days: number | null; eventTitle: string | null }) {
  return (
    <TileShell label="Days Until Next" icon="event_upcoming">
      <p className="font-display text-display text-on-surface">{days ?? '—'}</p>
      <p className="font-label-md text-label-md text-on-surface-variant mt-xs">
        {days == null ? 'No upcoming events' : `to ${eventTitle ?? 'event'}`}
      </p>
    </TileShell>
  );
}
