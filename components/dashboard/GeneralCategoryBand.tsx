import { DaysUntilTile } from './tiles/DaysUntilTile';
import { EventsByStatusTile } from './tiles/EventsByStatusTile';
import { AggregateRegistrationTile } from './tiles/AggregateRegistrationTile';
import { TeamTaskCompletionTile } from './tiles/TeamTaskCompletionTile';

export type GeneralCategoryProps = {
  days: number | null;
  nextEventTitle: string | null;
  nextIsLive?: boolean;
  counts: { drafted: number; registering: number; upcoming: number; live: number; completed: number };
  aggregateRegistration: number;
  // Number of events the aggregateRegistration sum was computed over — i.e.
  // events with lifecycle ∈ {registering, upcoming}. When this is 0, the tile
  // shows an empty state instead of "0 across upcoming events".
  upcomingCount: number;
  yourCompleted: number;
  yourTotal: number;
};

export function GeneralCategoryBand(p: GeneralCategoryProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-grid-gutter mb-xl">
      <DaysUntilTile days={p.days} eventTitle={p.nextEventTitle} nextIsLive={p.nextIsLive} />
      <EventsByStatusTile counts={p.counts} />
      <AggregateRegistrationTile total={p.aggregateRegistration} upcomingCount={p.upcomingCount} />
      <TeamTaskCompletionTile completed={p.yourCompleted} total={p.yourTotal} />
    </section>
  );
}
