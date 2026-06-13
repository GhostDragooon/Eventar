'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

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
  type BlockDraft, type BlockKind, type TopicDraft, agendaSummary, agendaValid,
} from '@/components/event-form/AgendaSection';
import type { Venue } from '@/lib/venue';
import { findParallelBlockIds } from '@/lib/agenda';
import { formatMinutes24h } from '@/components/event-form/DateTimeSection';

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

/**
 * Shape the form passes to `props.submit`. The form always builds the same
 * event/blocks payload; `status` is included only in create mode (the update
 * action deliberately ignores lifecycle — see updateAction.ts).
 */
export type SubmitPayload = {
  event: Record<string, unknown>;
  blocks: Array<Record<string, unknown>>;
  status?: 'draft' | 'published';
};

type SubmitResult = { ok: true } | { error: string };

/**
 * Pre-fill shape the edit page sends in. Mirrors the event row's columns +
 * the agenda BlockDraft shape used internally. Kept loose at the boundary so
 * the parent can pass an enriched row without coupling to the section state.
 */
export type InitialEvent = {
  title: string;
  topic?: string | null;
  description?: string | null;
  max_attendees?: number | null;
  start_time: string;   // ISO
  end_time: string;     // ISO
  venue_name: string;
  venue_address?: string | null;
  city: string;
  region?: string | null;
  country: string;
  latitude: number;
  longitude: number;
};

/**
 * Pre-fill shape for one agenda block: raw ISO start/end + the rest of the
 * row's primitive fields. The form derives HH:MM client-side via
 * parseLocalDateTime so the round-trip is symmetric — the server side
 * cannot derive HH:MM because the server tz (UTC on Vercel) is different
 * from the browser tz the encode side uses.
 */
export type InitialBlock = {
  id: string;
  start_time: string;   // ISO
  end_time: string;     // ISO
  kind: BlockKind;
  title: string;
  host: string | null;
  topics: Array<Partial<TopicDraft>>;
  notes: string | null;
};

type Props =
  | {
      mode: 'create';
      submit: (payload: SubmitPayload) => Promise<SubmitResult>;
    }
  | {
      mode: 'edit';
      eventId: string;
      initialEvent: InitialEvent;
      initialBlocks: InitialBlock[];
      submit: (payload: SubmitPayload) => Promise<SubmitResult>;
    };

/**
 * Derive the YYYY-MM-DD + start/end minutes-of-day from an ISO timestamp
 * pair, using the browser-local timezone the way the create-side encode does
 * (new Date(`${date}T${hh:mm}:00`).toISOString()). Pairing this `parseLocal`
 * with the existing `formatMinutes24h`-into-`new Date(...).toISOString()`
 * encode round-trips identically — the value you put in is the value the form
 * re-emits if the user doesn't touch the picker.
 */
function parseLocalDateTime(iso: string): { date: string; minutes: number } {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    minutes: d.getHours() * 60 + d.getMinutes(),
  };
}

function initialBasicsFrom(e: InitialEvent | null): BasicsValue {
  if (!e) return { title: '', topic: '', description: '', capacity: '' };
  return {
    title: e.title ?? '',
    topic: e.topic ?? '',
    description: e.description ?? '',
    capacity: e.max_attendees != null ? String(e.max_attendees) : '',
  };
}

function initialVenueFrom(e: InitialEvent | null): Venue | null {
  if (!e) return null;
  return {
    venue_name: e.venue_name,
    venue_address: e.venue_address ?? '',
    city: e.city,
    region: e.region ?? '',
    country: e.country,
    latitude: e.latitude,
    longitude: e.longitude,
  };
}

function initialDateTimeFrom(e: InitialEvent | null): DateTimeValue {
  if (!e) return { date: '', startMinutes: null, endMinutes: null };
  const start = parseLocalDateTime(e.start_time);
  const end = parseLocalDateTime(e.end_time);
  return { date: start.date, startMinutes: start.minutes, endMinutes: end.minutes };
}

function hhmmLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Convert the raw block rows the edit page passes in into BlockDraft state.
 * Runs client-side so the HH:MM derivation uses the same browser-local tz
 * as the encode path (parseLocalDateTime + new Date(`${date}T${hh:mm}:00`)).
 * Doing this server-side would derive HH:MM under the Vercel function's UTC
 * clock, then the form would re-emit at browser-local on save — silent tz
 * drift on every no-edit Save.
 */
function initialBlocksFrom(rows: InitialBlock[]): BlockDraft[] {
  return rows.map((b) => ({
    localId: b.id,
    start: hhmmLocal(b.start_time),
    end: hhmmLocal(b.end_time),
    kind: b.kind,
    title: b.title,
    host: b.host ?? '',
    topics: b.topics.map((t) => ({
      title: t.title ?? '',
      speaker_name: t.speaker_name ?? '',
      speaker_credential: t.speaker_credential ?? '',
      speaker_affiliation: t.speaker_affiliation ?? '',
    })),
    notes: b.notes ?? '',
  }));
}

export default function NewEventForm(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Base UI Accordion is array-valued; multiple=false (default) gives
  // single-open semantics. Wrap/unwrap to a single SectionId at the boundary.
  const [open, setOpen] = useState<SectionId>('basics');

  const initialEvent = props.mode === 'edit' ? props.initialEvent : null;

  const [basics, setBasics] = useState<BasicsValue>(() => initialBasicsFrom(initialEvent));
  const [venue, setVenue] = useState<Venue | null>(() => initialVenueFrom(initialEvent));
  const [datetime, setDatetime] = useState<DateTimeValue>(() => initialDateTimeFrom(initialEvent));
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    () => (props.mode === 'edit' ? initialBlocksFrom(props.initialBlocks) : []),
  );
  // Edit-mode success confirmation. Set after a successful Save; cleared on
  // the next submit attempt. Without this, router.refresh() repaints the
  // form to the same values and the user has no way to tell their click
  // landed (the protocol's "did I do the right thing?" failure mode).
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const v1 = basicsValid(basics);
  const v2 = venueValid(venue);
  const v3 = dateTimeValid(datetime);
  const v4 = agendaValid(blocks, datetime.startMinutes, datetime.endMinutes);
  // Completion = the three REQUIRED sections. Agenda is optional, so it does
  // not count toward "ready to publish" (an empty agenda is valid). It gets a
  // separate optional row in the checklist that only shows complete once the
  // user has actually drafted at least one valid block.
  const requiredValid = [v1, v2, v3];
  const completionPct = Math.round((requiredValid.filter(Boolean).length / requiredValid.length) * 100);
  const agendaDrafted = blocks.length > 0 && v4;

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
    setSavedAt(null);
    // Validate in section order; on the first failure, jump the user to that
    // section and explain. Buttons stay enabled (disabled-with-no-reason reads
    // as "broken"), so the click is what surfaces what's still needed.
    if (!v1) {
      setOpen('basics');
      setErr('Add the event basics (name) to continue.');
      return;
    }
    if (!v2) {
      setOpen('venue');
      setErr('Pick a venue from the dropdown to continue.');
      return;
    }
    if (!v3) {
      setOpen('datetime');
      setErr('Set the date, start, and end time to continue.');
      return;
    }
    if (!v4) {
      setOpen('agenda');
      setErr('Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title).');
      return;
    }
    setIntent(nextIntent);

    // dateTimeValid ensured startMinutes and endMinutes are non-null and end > start.
    const startTime = formatMinutes24h(datetime.startMinutes!);
    const endTime   = formatMinutes24h(datetime.endMinutes!);
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

    // Edit mode never sends `status` — the update RPC keeps the current
    // lifecycle value when the key is absent. Lifecycle changes live on the
    // page-level Publish action, not in the form.
    const payload: SubmitPayload = props.mode === 'edit'
      ? { event, blocks: blocksPayload }
      : { event, blocks: blocksPayload, status: nextIntent === 'publish' ? 'published' : 'draft' };

    start(async () => {
      const res = await props.submit(payload);
      if (res && 'error' in res) {
        setErr(res.error);
        setIntent(null);
        return;
      }
      // Create-mode success: parent's submit handler redirects (createEvent
      // throws the redirect; we never reach here). Edit-mode success: stay on
      // the page and pull the fresh server-rendered values (the action has
      // already revalidated /events/[id]/edit), so the form re-mounts with the
      // saved data as its initial values.
      if (props.mode === 'edit') {
        router.refresh();
        setIntent(null);
        setSavedAt(new Date());
      }
    });
  }

  const isEdit = props.mode === 'edit';

  return (
    <div className="pb-xxl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-on-surface-variant mb-sm">
        <Link href="/dashboard" className="font-label-md text-label-md uppercase tracking-wider hover:text-primary">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-primary">
          {isEdit ? 'Edit event' : 'New event'}
        </span>
      </nav>

      {/* Header — title + action buttons. Create mode keeps the dual
          Draft/Publish split (lifecycle decision belongs on the create
          surface). Edit mode collapses to a single Save Changes button —
          lifecycle is owned by the page's status pill + Publish ActionCard. */}
      <header className="mb-xl flex flex-col md:flex-row md:items-end md:justify-between gap-md">
        <div className="max-w-2xl">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {isEdit ? 'Edit event' : 'Create Event'}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
            {isEdit
              ? 'Edit the event details below. Save changes here, then publish from the panel on the right when you\'re ready.'
              : 'Configure the core details. Save as a draft anytime; publish when the registration page is ready to go live.'}
          </p>
        </div>
        <div className="flex gap-sm shrink-0">
          {isEdit ? (
            <Button
              type="button"
              onClick={() => onSubmit('draft')}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onSubmit('draft')}
                disabled={pending}
              >
                {pending && intent === 'draft' ? 'Saving…' : 'Save Draft'}
              </Button>
              <Button
                type="button"
                onClick={() => onSubmit('publish')}
                disabled={pending}
              >
                {pending && intent === 'publish' ? 'Publishing…' : 'Publish Event'}
              </Button>
            </>
          )}
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
                         title={SECTION_META.venue.label} summary={venueSummary(venue)}
                         unconstrained>
              <VenueSection value={venue} onChange={setVenue} />
              <DoneRow disabled={!v2} onDone={() => setOpen(NEXT_SECTION.venue)} />
            </SectionItem>

            <SectionItem id="datetime" open={open === 'datetime'} done={v3}
                         title={SECTION_META.datetime.label} summary={dateTimeSummary(datetime)}
                         unconstrained>
              <DateTimeSection value={datetime} onChange={(p) => setDatetime({ ...datetime, ...p })} />
              <DoneRow disabled={!v3} onDone={() => setOpen(NEXT_SECTION.datetime)} />
            </SectionItem>

            <SectionItem id="agenda" open={open === 'agenda'} done={v4}
                         title={SECTION_META.agenda.label} summary={agendaSummary(blocks, parallelIds)}
                         unconstrained>
              <AgendaSection
                date={datetime.date}
                eventStartMinutes={datetime.startMinutes}
                eventEndMinutes={datetime.endMinutes}
                blocks={blocks}
                onChange={setBlocks}
              />
            </SectionItem>
          </Accordion>

          {err && (
            <p
              role="alert"
              className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
            >
              <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>warning</span>
              <span className="flex-1">{err}</span>
            </p>
          )}
          {savedAt && !err && (
            <p
              role="status"
              aria-live="polite"
              data-testid="save-confirmation"
              className="font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm"
            >
              <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden data-fill="1">check_circle</span>
              <span className="flex-1">Saved as draft. Publish from the panel on the right when ready.</span>
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
              { label: 'Agenda (optional)',    done: agendaDrafted, optional: true },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}

function SectionItem({
  id, open, done, title, summary, children, unconstrained = false,
}: {
  id: SectionId; open: boolean; done: boolean; title: string; summary: string;
  children: React.ReactNode;
  unconstrained?: boolean;
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
      <AccordionContent className="pt-sm pb-lg" unconstrained={unconstrained}>
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
 * card from the New Event Setup mockup. Surface tokens match the form
 * sections so the card sits flat with the rest of the page in both light
 * and dark modes (previously bg-primary, which inverted to near-black in
 * light mode under the A.2 Vercel-canonical palette). The Draft pill uses
 * the amber warning tokens per §7a color rule ("amber = draft").
 * Completion counts only the required sections; required-but-incomplete
 * items show a hollow ring, optional incomplete items show a muted dash
 * (never a false checkmark).
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
  checklist: { label: string; done: boolean; optional?: boolean }[];
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant text-on-surface p-xl rounded-[20px] shadow-sm">
      <div className="flex items-center justify-between mb-lg">
        <span className="font-label-md text-label-md uppercase bg-warning-container text-on-warning-container px-md py-xs rounded-full tracking-wider">
          Status: Draft
        </span>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>auto_awesome</span>
      </div>
      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
        Setup Completion
      </p>
      <div
        className="w-full bg-surface-container-high h-2 rounded-full mb-xl overflow-hidden"
        role="progressbar"
        aria-valuenow={completionPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bg-primary h-full transition-all duration-500"
          style={{ width: `${completionPct}%` }}
        />
      </div>
      <ul className="space-y-md">
        {checklist.map((item) => {
          // Optional, not-yet-done items render in a muted "—" state so the
          // panel never claims an empty optional step is complete.
          const icon = item.done
            ? 'check_circle'
            : item.optional
              ? 'remove'
              : 'radio_button_unchecked';
          return (
            <li
              key={item.label}
              className={`flex items-center gap-md ${item.done ? 'text-on-surface' : 'text-on-surface-variant'}`}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${item.done ? 'text-primary' : ''}`}
                aria-hidden
                data-fill={item.done ? '1' : undefined}
              >
                {icon}
              </span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
