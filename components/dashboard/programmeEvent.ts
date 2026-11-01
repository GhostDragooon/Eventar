import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import type { EventFormat } from '@/app/events/new/schema';

/** One event row as the Events home shows it, decorated server-side by fetchDecoratedEvents. */
export type ProgrammeEvent = {
  id: string;
  title: string;
  description: string | null;
  lifecycle: Lifecycle;
  startMs: number;
  dateLabel: string;
  timeLabel: string;
  venueName: string | null;
  maxAttendees: number | null;
  registered: number;
  attended: number;
  delta7: number;
  closesInDays: number | null;
  category: string | null;
  deleted: boolean;
  /** The event's own local calendar date (YYYY-MM-DD in events.timezone). */
  dayKey: string;
  format: EventFormat | null;
  hero_image_url: string | null;
  city: string | null;
  hosts: Array<{ name: string; avatar_url: string | null }>;
};
