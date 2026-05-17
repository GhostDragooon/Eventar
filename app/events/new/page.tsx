'use client';

import { useState, useTransition } from 'react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { createEvent } from './actions';

import BasicsSection, {
  type BasicsValue, basicsSummary, basicsValid,
} from '@/components/event-form/BasicsSection';
import VenueSection, {
  venueSummary, venueValid,
} from '@/components/event-form/VenueSection';
import DateTimeSection, {
  type DateTimeValue, dateTimeSummary, dateTimeValid,
} from '@/components/event-form/DateTimeSection';
import AgendaSection, {
  type BlockDraft, agendaSummary, agendaValid,
} from '@/components/event-form/AgendaSection';
import type { Venue } from '@/lib/mapbox';
import { deriveEnd } from '@/lib/time';
import { findParallelBlockIds } from '@/lib/agenda';

type SectionId = 'basics' | 'venue' | 'datetime' | 'agenda';
const NEXT_SECTION: Record<SectionId, SectionId> = {
  basics:   'venue',
  venue:    'datetime',
  datetime: 'agenda',
  agenda:   'agenda', // terminal: user clicks Save in sticky bar
};

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Base UI Accordion is array-valued; multiple=false (default) gives
  // single-open semantics. Wrap/unwrap to a single SectionId at the boundary.
  const [open, setOpen] = useState<SectionId>('basics');

  const [basics, setBasics] = useState<BasicsValue>({
    title: '', topic: '', description: '', capacity: '',
  });
  const [venue, setVenue] = useState<Venue | null>(null);
  const [datetime, setDatetime] = useState<DateTimeValue>({
    date: '', startTime: '09:00', duration: '8h', customEnd: '',
  });
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);

  const v1 = basicsValid(basics);
  const v2 = venueValid(venue);
  const v3 = dateTimeValid(datetime);
  const v4 = agendaValid(blocks);
  const canSubmit = v1 && v2 && v3 && v4;

  // For the agenda summary's parallel-block check
  const parallelIds = (() => {
    const items = blocks.filter(b => b.start && b.end).map(b => ({
      id: b.localId,
      start_time: `${datetime.date}T${b.start}`,
      end_time:   `${datetime.date}T${b.end}`,
    }));
    return findParallelBlockIds(items);
  })();

  function onSubmit() {
    setErr(null);
    if (!v1 || !v2 || !v3) {
      setErr('Complete Basics, Venue, and Date & Time first.');
      return;
    }

    const endTime = deriveEnd(datetime.startTime, datetime.duration, datetime.customEnd);
    const event = {
      title:         basics.title,
      topic:         basics.topic || undefined,
      description:   basics.description,
      max_attendees: basics.capacity || undefined,
      start_time:    new Date(`${datetime.date}T${datetime.startTime}:00`).toISOString(),
      end_time:      new Date(`${datetime.date}T${endTime}:00`).toISOString(),
      ...venue!,
    };
    const blocksPayload = blocks.map((b, i) => ({
      start_time: new Date(`${datetime.date}T${b.start}:00`).toISOString(),
      end_time:   new Date(`${datetime.date}T${b.end}:00`).toISOString(),
      kind: b.kind,
      title: b.title,
      host: b.host,
      topics: b.topics,
      notes: b.notes,
      display_order: i,
    }));

    start(async () => {
      const res = await createEvent({ event, blocks: blocksPayload });
      if (res && 'error' in res) setErr(res.error);
    });
  }

  return (
    <main className="max-w-3xl mx-auto p-6 pb-32">
      <h1 className="text-2xl font-semibold mb-6 text-gray-900">New event</h1>

      <Accordion
        value={[open]}
        onValueChange={(v) => v[0] && setOpen(v[0] as SectionId)}
        className="space-y-3"
      >
        <SectionItem id="basics" open={open === 'basics'} done={v1}
                     title="Basics" summary={basicsSummary(basics)}>
          <BasicsSection value={basics} onChange={(p) => setBasics({ ...basics, ...p })} />
          <DoneRow disabled={!v1} onDone={() => setOpen(NEXT_SECTION.basics)} />
        </SectionItem>

        <SectionItem id="venue" open={open === 'venue'} done={v2}
                     title="Venue" summary={venueSummary(venue)}>
          <VenueSection value={venue} onChange={setVenue} />
          <DoneRow disabled={!v2} onDone={() => setOpen(NEXT_SECTION.venue)} />
        </SectionItem>

        <SectionItem id="datetime" open={open === 'datetime'} done={v3}
                     title="Date & Time" summary={dateTimeSummary(datetime)}>
          <DateTimeSection value={datetime} onChange={(p) => setDatetime({ ...datetime, ...p })} />
          <DoneRow disabled={!v3} onDone={() => setOpen(NEXT_SECTION.datetime)} />
        </SectionItem>

        <SectionItem id="agenda" open={open === 'agenda'} done={v4}
                     title="Agenda" summary={agendaSummary(blocks, parallelIds)}>
          <AgendaSection date={datetime.date} blocks={blocks} onChange={setBlocks} />
        </SectionItem>
      </Accordion>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <ProgressDots states={[v1, v2, v3, v4]} />
          {err && <p className="text-sm text-red-700 flex-1">{err}</p>}
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || pending} className="ml-auto">
            {pending ? 'Saving…' : 'Save as draft'}
          </Button>
        </div>
      </div>
    </main>
  );
}

function SectionItem({
  id, open, done, title, summary, children,
}: {
  id: string; open: boolean; done: boolean; title: string; summary: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={id} className="border rounded-xl px-4 bg-white">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center gap-3 text-left flex-1">
          <span className={done ? 'text-green-700' : 'text-gray-400'}>
            {done ? '✓' : '○'}
          </span>
          <div className="flex-1">
            <div className="font-medium text-gray-900">{title}</div>
            {!open && (
              <div className="text-sm text-gray-600 mt-0.5">{summary}</div>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function DoneRow({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  return (
    <div className="flex justify-end mt-4">
      <Button type="button" disabled={disabled} onClick={onDone}>Done</Button>
    </div>
  );
}

function ProgressDots({ states }: { states: boolean[] }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${states.filter(Boolean).length} of ${states.length} sections complete`}>
      {states.map((on, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2 w-2 rounded-full ${on ? 'bg-green-600' : 'bg-gray-300'}`}
        />
      ))}
    </div>
  );
}
