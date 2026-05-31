import { DaysUntilTile } from './tiles/DaysUntilTile';
import { EventsByStatusTile } from './tiles/EventsByStatusTile';
import { AggregateRegistrationTile } from './tiles/AggregateRegistrationTile';
import { TeamTaskCompletionTile } from './tiles/TeamTaskCompletionTile';

export type GeneralCategoryProps = {
  days: number | null;
  nextEventTitle: string | null;
  counts: { drafted: number; registering: number; upcoming: number; live: number; completed: number };
  aggregateRegistration: number;
  yourCompleted: number;
  yourTotal: number;
};

export function GeneralCategoryBand(p: GeneralCategoryProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-grid-gutter mb-xl">
      <DaysUntilTile days={p.days} eventTitle={p.nextEventTitle} />
      <EventsByStatusTile counts={p.counts} />
      <AggregateRegistrationTile total={p.aggregateRegistration} />
      <TeamTaskCompletionTile completed={p.yourCompleted} total={p.yourTotal} />
    </section>
  );
}
