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

const SECTION_META: Record<SectionId, { icon: string; iconBg: string; iconColor: string; label: string }> = {
  basics:   { icon: 'info',           iconBg: 'bg-primary-fixed',   iconColor: 'text-primary',   label: 'Basics' },
  venue:    { icon: 'location_on',    iconBg: 'bg-secondary-fixed', iconColor: 'text-secondary', label: 'Venue' },
  datetime: { icon: 'calendar_month', iconBg: 'bg-tertiary-fixed',  iconColor: 'text-tertiary',  label: 'Date & Time' },
  agenda:   { icon: 'view_agenda',    iconBg: 'bg-primary-fixed',   iconColor: 'text-primary',   label: 'Agenda' },
};

type Intent = 'draft' | 'publish';

export default function NewEventForm() {
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState<Intent | null>(null);
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
  const validSections = [v1, v2, v3, v4];
  const completedCount = validSections.filter(Boolean).length;
  const completionPct = Math.round((completedCount / validSections.length) * 100);
  // Save Draft: just needs Basics/Venue/Date+Time (Agenda optional).
  // Publish:    same gate — agenda is still optional. Distinguishing copy
  // makes it obvious which button does what.
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

  function onSubmit(nextIntent: Intent) {
    setErr(null);
    if (!v1 || !v2 || !v3) {
      setErr('Complete Basics, Venue, and Date & Time first.');
      return;
    }
    setIntent(nextIntent);

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
      const res = await createEvent({
        event,
        blocks: blocksPayload,
        status: nextIntent === 'publish' ? 'published' : 'draft',
      });
      if (res && 'error' in res) {
        setErr(res.error);
        setIntent(null);
      }
      // success redirects, so no else branch needed
    });
  }

  return (
    <div className="pb-xxl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-on-surface-variant mb-sm">
        <Link href="/dashboard" className="font-label-md text-label-md uppercase tracking-wider hover:text-primary">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-primary">New event</span>
      </nav>

      {/* Header — title + dual action buttons (Save Draft + Publish Event) */}
      <header className="mb-xl flex flex-col md:flex-row md:items-end md:justify-between gap-md">
        <div className="max-w-2xl">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            Create Event
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
            Configure the core details. Save as a draft anytime; publish when the
            registration page is ready to go live.
          </p>
        </div>
        <div className="flex gap-sm shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onSubmit('draft')}
            disabled={!canSubmit || pending}
          >
            {pending && intent === 'draft' ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit('publish')}
            disabled={!canSubmit || pending}
          >
            {pending && intent === 'publish' ? 'Publishing…' : 'Publish Event'}
          </Button>
        </div>
      </header>

      {/* 8/4 grid: form on left, status panel sticky-right on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-grid-gutter items-start">
        <div className="lg:col-span-8 space-y-md">
          <Accordion
            value={[open]}
            onValueChange={(v) => v[0] && setOpen(v[0] as SectionId)}
            className="space-y-md"
          >
            <SectionItem id="basics" open={open === 'basics'} done={v1}
                         title={SECTION_META.basics.label} summary={basicsSummary(basics)}>
              <BasicsSection value={basics} onChange={(p) => setBasics({ ...basics, ...p })} />
              <DoneRow disabled={!v1} onDone={() => setOpen(NEXT_SECTION.basics)} />
            </SectionItem>

            <SectionItem id="venue" open={open === 'venue'} done={v2}
                         title={SECTION_META.venue.label} summary={venueSummary(venue)}>
              <VenueSection value={venue} onChange={setVenue} />
              <DoneRow disabled={!v2} onDone={() => setOpen(NEXT_SECTION.venue)} />
            </SectionItem>

            <SectionItem id="datetime" open={open === 'datetime'} done={v3}
                         title={SECTION_META.datetime.label} summary={dateTimeSummary(datetime)}>
              <DateTimeSection value={datetime} onChange={(p) => setDatetime({ ...datetime, ...p })} />
              <DoneRow disabled={!v3} onDone={() => setOpen(NEXT_SECTION.datetime)} />
            </SectionItem>

            <SectionItem id="agenda" open={open === 'agenda'} done={v4}
                         title={SECTION_META.agenda.label} summary={agendaSummary(blocks, parallelIds)}>
              <AgendaSection date={datetime.date} blocks={blocks} onChange={setBlocks} />
            </SectionItem>
          </Accordion>

          {err && (
            <p
              role="alert"
              className="font-body-md text-body-md text-error bg-error-container/20 border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
            >
              <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>warning</span>
              <span className="flex-1">{err}</span>
            </p>
          )}
        </div>

        {/* Right column — Status / Setup Completion (sticky on lg) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-grid-margin space-y-md self-start">
          <StatusPanel
            completionPct={completionPct}
            checklist={[
              { label: 'Basic Details Added',  done: v1 },
              { label: 'Venue Set',            done: v2 },
              { label: 'Date & Time Defined',  done: v3 },
              { label: 'Agenda Drafted',       done: v4 },
            ]}
          />
        </aside>
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

/**
 * Right-column status panel — mirrors the "STATUS: DRAFT / Setup Completion"
 * card from the New Event Setup mockup. Lifts the dark indigo card with
 * progress bar + checkmark list; deferred items show a hollow ring.
 *
 * "Status" stays Draft on this page — the form has never saved, so the
 * draft/published distinction is the user's INTENT (encoded by which
 * action button they click), not a stored value. After save the user is
 * redirected to /events/[id]/edit where the live event status pill lives.
 */
function StatusPanel({
  completionPct,
  checklist,
}: {
  completionPct: number;
  checklist: { label: string; done: boolean }[];
}) {
  return (
    <div className="bg-primary text-on-primary p-xl rounded-[20px] shadow-xl overflow-hidden relative">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-lg">
          <span className="font-label-md text-label-md uppercase bg-on-primary/15 px-md py-xs rounded-full tracking-wider">
            Status: Draft
          </span>
          <span className="material-symbols-outlined text-on-primary/60" aria-hidden>auto_awesome</span>
        </div>
        <p className="font-label-md text-label-md uppercase tracking-wider text-on-primary/80 mb-xs">
          Setup Completion
        </p>
        <div
          className="w-full bg-on-primary/20 h-2 rounded-full mb-xl overflow-hidden"
          role="progressbar"
          aria-valuenow={completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="bg-on-primary h-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <ul className="space-y-md">
          {checklist.map((item) => (
            <li key={item.label} className={`flex items-center gap-md ${item.done ? '' : 'opacity-60'}`}>
              <span
                className="material-symbols-outlined text-[20px]"
                aria-hidden
                data-fill={item.done ? '1' : undefined}
              >
                {item.done ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Decorative blur */}
      <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-on-primary/5 rounded-full blur-3xl" aria-hidden />
    </div>
  );
}
