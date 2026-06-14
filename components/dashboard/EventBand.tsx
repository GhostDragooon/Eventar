import Link from 'next/link';
import { CHECKIN_OPEN_MINUTES, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// Per-tile lifecycle drives the stripe color, stat line and destination route.
// `cancelled` is handled separately by the dashboard but included for completeness
// so a tiny cancelled section can reuse this component.
export type BandLifecycle = 'live' | 'draft' | 'completed' | 'cancelled';

export type TileEvent = {
  id: string;
  title: string;
  start_time: string;
  timezone: string;
  max_attendees: number | null;
  registered: number;
  attended: number;
  registration_close_at: string | null;
  // Per-event lifecycle (registering | upcoming | live | drafted | completed | cancelled)
  // drives the tile's stat-line copy even inside the aggregated "Live" band.
  lifecycle: Lifecycle;
};

const PILL_CLASS: Record<BandLifecycle, string> = {
  live: 'bg-success-container text-on-success-container',
  draft: 'bg-warning-container text-on-warning-container',
  completed: 'bg-surface-container-high text-on-surface-variant',
  cancelled: 'bg-error-container text-on-error-container',
};

const PILL_GLYPH: Record<BandLifecycle, string> = {
  live: '●', // ●
  draft: '○', // ○
  completed: '✓', // ✓
  cancelled: '✕', // ✕
};

const PILL_LABEL: Record<BandLifecycle, string> = {
  live: 'Live',
  draft: 'Draft',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const MAX_VISIBLE = 6;

export function EventBand({
  lifecycle,
  events,
  nowMs,
}: {
  lifecycle: BandLifecycle;
  events: TileEvent[];
  nowMs: number;
}) {
  if (events.length === 0) return null;
  const visible = events.slice(0, MAX_VISIBLE);
  const overflow = events.length > MAX_VISIBLE;
  return (
    <section className="mb-xl">
      <h3 className="flex items-center gap-sm mb-md">
        <span
          className={`inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-md text-label-md uppercase ${PILL_CLASS[lifecycle]}`}
        >
          <span aria-hidden>{PILL_GLYPH[lifecycle]}</span>
          {PILL_LABEL[lifecycle]}
        </span>
        <span className="font-body-md text-body-md text-on-surface-variant">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </h3>
      <ul className="flex flex-col gap-sm">
        {visible.map((e) => (
          <li key={e.id}>
            <Tile event={e} band={lifecycle} nowMs={nowMs} />
          </li>
        ))}
      </ul>
      {overflow && (
        // v1: count-only line per task spec; expand interaction deferred.
        <p className="font-body-md text-body-md text-on-surface-variant text-center mt-md">
          Showing {visible.length} of {events.length} events
        </p>
      )}
    </section>
  );
}

const STRIPE_CLASS: Record<BandLifecycle, string> = {
  live: 'bg-success',
  draft: 'bg-warning',
  completed: 'bg-outline',
  cancelled: 'bg-error',
};

function tileHref(e: TileEvent): string {
  // Draft → /edit (the only mutation surface).
  // Completed → /analytics (the mockup's stat row "View analytics →" signals
  //   the tile's destination differs from live/upcoming).
  // Everything else → /details (the ops view).
  if (e.lifecycle === 'drafted')   return `/events/${e.id}/edit`;
  if (e.lifecycle === 'completed') return `/events/${e.id}/analytics`;
  return `/events/${e.id}/details`;
}

// Format like "Thu 18 Jun" — short weekday + day + short month, in the event's tz.
function shortDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.weekday} ${m.day} ${m.month}`;
}

function daysUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 86_400_000));
}

function pluralDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

function metaLine(e: TileEvent): string {
  if (e.lifecycle === 'drafted') return 'Date not set · capacity not set';
  const date = shortDate(e.start_time, e.timezone);
  const cap = e.max_attendees == null ? `${e.registered}` : `${e.registered} / ${e.max_attendees}`;
  if (e.lifecycle === 'completed') return `${date} · ${cap} attended`;
  return `${date} · ${cap}`;
}

function statLine(e: TileEvent, nowMs: number): { text: string; className: string; href?: string } {
  switch (e.lifecycle) {
    case 'live':
      return { text: '● Live now', className: 'text-success' };
    case 'upcoming': {
      const checkinOpensMs =
        new Date(e.start_time).getTime() - CHECKIN_OPEN_MINUTES * 60_000;
      const n = daysUntil(checkinOpensMs, nowMs);
      return { text: `● Check-in opens in ${pluralDays(n)}`, className: 'text-on-surface-variant' };
    }
    case 'registering': {
      if (e.registration_close_at) {
        const n = daysUntil(new Date(e.registration_close_at).getTime(), nowMs);
        return { text: `● Registration closes in ${pluralDays(n)}`, className: 'text-on-surface-variant' };
      }
      return { text: '● Registration open', className: 'text-on-surface-variant' };
    }
    case 'drafted':
      return { text: '○ Draft · not yet published', className: 'text-warning' };
    case 'completed':
      return { text: 'View analytics →', className: 'text-on-surface-variant', href: `/events/${e.id}/analytics` };
    case 'cancelled':
      return { text: '✕ Cancelled', className: 'text-on-surface-variant' };
  }
}

function Tile({
  event,
  band,
  nowMs,
}: {
  event: TileEvent;
  band: BandLifecycle;
  nowMs: number;
}) {
  const stat = statLine(event, nowMs);
  return (
    <Link
      href={tileHref(event)}
      className="flex items-start gap-md p-md bg-surface-container-lowest border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors group"
    >
      <span
        className={`w-1.5 h-10 rounded-full shrink-0 mt-xs ${STRIPE_CLASS[band]}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="font-title-md text-title-md text-on-surface group-hover:text-primary transition-colors truncate">
          {event.title}
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">{metaLine(event)}</p>
        <p className={`font-label-md text-label-md mt-xs uppercase ${stat.className}`}>
          {stat.text}
        </p>
      </div>
    </Link>
  );
}
