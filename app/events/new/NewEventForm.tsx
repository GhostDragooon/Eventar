'use client';

import Link from 'next/link';
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
import type { Venue } from '@/lib/venue';
import { findParallelBlockIds } from '@/lib/agenda';
import { formatHour } from '@/lib/time-range';

type SectionId = 'basics' | 'venue' | 'datetime' | 'agenda';
const NEXT_SECTION: Record<SectionId, SectionId> = {
  basics:   'venue',
  venue:    'datetime',
  datetime: 'agenda',
  agenda:   'agenda', // terminal: user clicks Save in sticky bar
};

const SECTION_META: Record<SectionId, { icon: string; iconBg: string; iconColor: string }> = {
  basics:   { icon: 'info',             iconBg: 'bg-primary-fixed',    iconColor: 'text-primary' },
  venue:    { icon: 'location_on',      iconBg: 'bg-secondary-fixed',  iconColor: 'text-secondary' },
  datetime: { icon: 'calendar_month',   iconBg: 'bg-tertiary-fixed',   iconColor: 'text-tertiary' },
  agenda:   { icon: 'view_agenda',      iconBg: 'bg-primary-fixed',    iconColor: 'text-primary' },
};

export default function NewEventForm() {
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
    date: '', startHour: null, endHour: null,
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

    // dateTimeValid ensured startHour and endHour are non-null and end > start.
    const startTime = formatHour(datetime.startHour!);
    const endTime   = formatHour(datetime.endHour!);
    const event = {
      title:         basics.title,
      topic:         basics.topic || undefined,
      description:   basics.description,
      max_attendees: basics.capacity || undefined,
      start_time:    new Date(`${datetime.date}T${startTime}:00`).toISOString(),
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
    <div className="pb-32">
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-on-surface-variant mb-sm">
        <Link href="/dashboard" className="font-label-md text-label-md uppercase tracking-wider hover:text-primary">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-primary">New event</span>
      </nav>

      <header className="mb-xl max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Create Event
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Configure the core details. Work through each section; you can save as a draft when the basics are set.
        </p>
      </header>

      <Accordion
        value={[open]}
        onValueChange={(v) => v[0] && setOpen(v[0] as SectionId)}
        className="space-y-md max-w-3xl"
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

      {/* Sticky bottom bar — sits above the StaffShell footer */}
      <div className="fixed bottom-0 inset-x-0 md:left-64 bg-surface-container-lowest border-t border-outline-variant p-md z-30">
        <div className="max-w-3xl mx-auto flex items-center gap-md">
          <ProgressDots states={[v1, v2, v3, v4]} />
          {err && (
            <p className="font-body-md text-body-md text-error flex-1" role="alert">
              {err}
            </p>
          )}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || pending}
            className="ml-auto"
          >
            {pending ? 'Saving…' : 'Save as draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionItem({
  id, open, done, title, summary, children,
}: {
  id: SectionId; open: boolean; done: boolean; title: string; summary: string;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[id];
  return (
    <AccordionItem
      value={id}
      className="border border-outline-variant rounded-[20px] px-lg bg-surface-container-lowest shadow-sm"
    >
      <AccordionTrigger className="hover:no-underline py-md">
        <div className="flex items-center gap-md text-left flex-1">
          <div
            aria-hidden
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${meta.iconBg} ${meta.iconColor}`}
          >
            <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-sm">
              <span className="font-headline-sm text-[20px] text-on-surface">{title}</span>
              {done && (
                <span
                  aria-label="complete"
                  className="material-symbols-outlined text-primary text-[20px]"
                  data-fill="1"
                >
                  check_circle
                </span>
              )}
            </div>
            {!open && (
              <div className="font-body-md text-body-md text-on-surface-variant mt-xs truncate">
                {summary}
              </div>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-sm pb-lg">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function DoneRow({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  return (
    <div className="flex justify-end mt-md">
      <Button type="button" disabled={disabled} onClick={onDone}>Done</Button>
    </div>
  );
}

function ProgressDots({ states }: { states: boolean[] }) {
  return (
    <div
      className="flex items-center gap-xs"
      aria-label={`${states.filter(Boolean).length} of ${states.length} sections complete`}
    >
      {states.map((on, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2 w-2 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-outline-variant'}`}
        />
      ))}
    </div>
  );
}
