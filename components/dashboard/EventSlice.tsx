import Link from 'next/link';
import { formatInTz } from '@/lib/tz';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

type EventSliceProps = {
  id: string;
  title: string;
  start_time: string;
  timezone: string;
  venue_name: string | null;
  max_attendees: number | null;
  registered: number;
  attended: number;
  lifecycle: Lifecycle;
};

const DESTINATION: Record<Lifecycle, (id: string) => string> = {
  drafted: (id) => `/events/${id}/edit`,
  registering: (id) => `/events/${id}/details`,
  upcoming: (id) => `/events/${id}/details`,
  live: (id) => `/events/${id}/checkin`,
  completed: (id) => `/events/${id}/analytics`,
  cancelled: (id) => `/events/${id}/edit`,
};

export function EventSlice(p: EventSliceProps) {
  const capacityStr = p.max_attendees == null ? `${p.registered}` : `${p.registered}/${p.max_attendees}`;
  const showAttended = p.lifecycle === 'completed';

  return (
    <Link
      href={DESTINATION[p.lifecycle](p.id)}
      className="flex items-start gap-md p-md hover:bg-surface-container-low transition-colors group"
    >
      <div className="w-28 flex flex-col gap-xs shrink-0">
        <span className="font-label-md text-label-md text-on-surface">{formatInTz(p.start_time, p.timezone)}</span>
        <span className="font-body-md text-[12px] text-on-surface-variant">{p.timezone}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-title-lg text-title-lg text-on-surface group-hover:text-primary transition-colors truncate">
          {p.title}
        </h3>
        {p.venue_name && (
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>location_on</span>
            <span className="truncate">{p.venue_name}</span>
          </p>
        )}
        <div className="flex items-center gap-sm mt-sm flex-wrap">
          <StatusPill lifecycle={p.lifecycle} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-title-lg text-title-lg text-on-surface font-bold">{capacityStr}</p>
        {showAttended && (
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs">{p.attended} attended</p>
        )}
      </div>
    </Link>
  );
}
