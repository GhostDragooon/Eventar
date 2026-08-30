'use client';

import { useState } from 'react';
import { SiteShell } from '@/components/shell/SiteShell';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { EventCard, type EventCardRecord } from '@/components/event-discovery/EventCard';
import { ExpandableEventCard } from '@/components/event-discovery/ExpandableEventCard';
import { Pagination } from '@/components/navigation/Pagination';

const EVENTS: EventCardRecord[] = [
  {
    id: '1',
    title: 'ICI Cardiovascular Summit 2026',
    summary: 'Two-day summit covering the latest in interventional cardiology, jointly accredited by 13 bodies.',
    format: 'Conference',
    dateLabel: '12–13 Sep 2026',
    venueLabel: 'HKCEC, Wan Chai',
    imageUrl: '',
  },
  {
    id: '2',
    title: 'HKCP Annual Scientific Meeting',
    summary: 'The College’s flagship CPD event for physicians, with parallel tracks and a keynote plenary.',
    format: 'Conference',
    dateLabel: '3 Oct 2026',
    venueLabel: 'Hong Kong Academy of Medicine Jockey Club Building',
    imageUrl: '',
  },
  {
    id: '3',
    title: 'Evidence-Based Practice Workshop',
    summary: 'Hands-on session for early-career practitioners, capped at 40 seats.',
    format: 'Workshop',
    dateLabel: '18 Oct 2026',
    venueLabel: 'Online (Zoom)',
    imageUrl: '',
  },
];

export default function EventsPreview() {
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SiteShell active="events">
      <div className="mx-auto max-w-4xl px-grid-margin py-xl">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Upcoming events' }]} />

        <h1 className="mt-md font-headline-lg text-headline-lg text-on-surface">Upcoming events</h1>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
          CPD-accredited events open for registration.
        </p>

        <div className="mt-xl space-y-lg">
          {EVENTS.map((event) =>
            openId === event.id ? (
              <ExpandableEventCard
                key={event.id}
                event={event}
                open
                onOpenChange={(v) => setOpenId(v ? event.id : null)}
                saved={saved[event.id] ?? false}
                onSaveChange={(id, v) => setSaved((prev) => ({ ...prev, [id]: v }))}
              />
            ) : (
              <EventCard
                key={event.id}
                event={event}
                saved={saved[event.id] ?? false}
                onSaveChange={(id, v) => setSaved((prev) => ({ ...prev, [id]: v }))}
                onOpen={setOpenId}
              />
            ),
          )}
        </div>

        <div className="mt-xl flex justify-center">
          <Pagination page={page} pageCount={4} onPageChange={setPage} />
        </div>
      </div>
    </SiteShell>
  );
}
