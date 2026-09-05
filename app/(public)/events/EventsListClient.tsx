'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { EventCard, type EventCardStatus } from '@/components/event-discovery/EventCard';

export type PublicEventCard = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  day: string;
  month: string;
  time: string;
  venue: string;
  organizers: string[];
  lifecycle: Lifecycle;
};

// Category selector (locked): horizontal tabs, SENTENCE CASE, no boxes, a
// short accent underline under the active tab only, full-width hairline.
//
// WP5 E1 — swapped from cross-industry (life_sciences / engineering /
// finance / technology) to profession-aligned for the HK CPD pilot. Empty
// Finance and Technology tabs on a page selling medical CPD read as
// "abandoned product". Keep `all` as the honest default.
//   ponytail: string map, replace with a controlled taxonomy when a real
//   profession list is loaded from the DB (deferred; §4 explicitly lists
//   "Controlled taxonomies for position/profession").
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'medicine_dentistry', label: 'Medicine & dentistry' },
  { key: 'allied_health', label: 'Allied health' },
  { key: 'other', label: 'Other' },
];

// Green is reserved for live/verified (vault Frontend Design Standard §2);
// everything else takes the neutral container.
function lifecycleStatus(lifecycle: Lifecycle): EventCardStatus {
  if (lifecycle === 'registering') return { label: 'Registering', tone: 'success' };
  if (lifecycle === 'live') return { label: 'Live', tone: 'success' };
  return { label: 'Starts soon', tone: 'neutral' };
}

export function EventsListClient({ events }: { events: PublicEventCard[] }) {
  const [cat, setCat] = useState('all');
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Sliding underline: one shared indicator translates to the active tab
  // (measured, so it tracks font metrics + resize).
  useLayoutEffect(() => {
    function measure() {
      const list = listRef.current;
      const tab = tabRefs.current.get(cat);
      if (!list || !tab) return;
      const lr = list.getBoundingClientRect();
      const tr = tab.getBoundingClientRect();
      setIndicator({ left: tr.left - lr.left + list.scrollLeft + tr.width / 2 - 12, width: 24 });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cat]);

  const visible = useMemo(
    () => (cat === 'all' ? events : events.filter((e) => e.category === cat)),
    [events, cat],
  );

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Event categories"
        className="relative flex items-center justify-center gap-[40px] overflow-x-auto border-b border-outline-variant mb-lg"
      >
        {CATEGORIES.map((c) => {
          const active = cat === c.key;
          return (
            // <div role="tab"> not <button> — locked render rule (host button
            // styling clobbers) + hover stays a subtle text-darken, no box.
            <div
              key={c.key}
              ref={(el) => {
                if (el) tabRefs.current.set(c.key, el);
                else tabRefs.current.delete(c.key);
              }}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => setCat(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCat(c.key);
                }
              }}
              className={`relative shrink-0 pb-md pt-xs cursor-pointer text-[calc(14px*var(--text-scale))] font-semibold transition-colors ${
                active ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {c.label}
            </div>
          );
        })}
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-0 h-[2px] bg-[color:var(--on-primary-container)] rounded-full transition-[left,width] duration-250 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {events.length === 0 ? 'No open events right now — check back soon.' : 'Nothing in this category right now.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {visible.map((e) => (
            <li key={e.id}>
              <EventCard
                event={{
                  id: e.id,
                  title: e.title,
                  format: e.category ? CATEGORIES.find((c) => c.key === e.category)?.label : undefined,
                  dateLabel: e.time,
                  venueLabel: e.venue,
                  dateBlock: { day: e.day, month: e.month },
                  status: lifecycleStatus(e.lifecycle),
                  organizers: e.organizers,
                }}
                href={`/events/${e.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
