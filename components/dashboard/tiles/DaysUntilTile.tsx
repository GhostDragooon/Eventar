import { TileShell } from './TileShell';

type Props = {
  days: number | null;
  eventTitle: string | null;
  nextIsLive?: boolean;
};

export function DaysUntilTile({ days, eventTitle, nextIsLive }: Props) {
  // Three display modes, picked by the data:
  //   1. No event coming up → "—" + "No upcoming events"
  //   2. Next event is in progress now → "Live" + title
  //   3. Next event starts today (days===0, not live) → "Today" + title
  //   4. N days away → number + "to {title}"
  let headline: string;
  let subtext: string;
  if (days == null) {
    headline = '—';
    subtext = 'No upcoming events';
  } else if (nextIsLive) {
    headline = 'Live';
    subtext = eventTitle ?? 'event';
  } else if (days === 0) {
    headline = 'Today';
    subtext = eventTitle ?? 'event';
  } else {
    headline = String(days);
    subtext = `to ${eventTitle ?? 'event'}`;
  }

  return (
    <TileShell label="Days Until Next" icon="event_upcoming">
      <p className="font-display text-display text-on-surface">{headline}</p>
      <p className="font-label-md text-label-md text-on-surface-variant mt-xs">{subtext}</p>
    </TileShell>
  );
}
