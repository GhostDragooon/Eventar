'use client';

import { useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { EventSlice } from './EventSlice';

const SECTION_LABEL: Record<Lifecycle, string> = {
  drafted: 'Drafted',
  registering: 'Registering',
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function EventLifecycleSection({
  lifecycle,
  events,
  defaultCollapsed = false,
}: {
  lifecycle: Lifecycle;
  events: React.ComponentProps<typeof EventSlice>[];
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (events.length === 0) return null;
  return (
    <section className="mb-lg">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex justify-between items-center p-md text-left hover:bg-surface-container-low transition-colors rounded-lg"
      >
        <span className="font-title-lg text-title-lg text-on-surface">
          {SECTION_LABEL[lifecycle]} <span className="text-on-surface-variant">({events.length})</span>
        </span>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
          {collapsed ? 'expand_more' : 'expand_less'}
        </span>
      </button>
      {!collapsed && (
        <ul className="bg-surface-container-lowest border border-outline-variant rounded-[20px] divide-y divide-surface-container-highest overflow-hidden">
          {events.map((e) => (
            <li key={e.id}>
              <EventSlice {...e} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
