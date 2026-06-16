'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

import BasicsSection, {
  CapacityField,
  type BasicsValue, basicsValid,
} from '@/components/event-form/BasicsSection';
import VenueSection, {
  venueValid,
} from '@/components/event-form/VenueSection';
import DateTimeSection, {
  type DateTimeValue, dateTimeValid,
} from '@/components/event-form/DateTimeSection';
import AgendaSection, {
  type BlockDraft, type BlockKind, type TopicDraft, agendaValid,
} from '@/components/event-form/AgendaSection';
import type { Venue } from '@/lib/venue';
import { tzFromCoords } from '@/lib/tz';
import { formatMinutes24h } from '@/components/event-form/DateTimeSection';

// `preview` is edit-mode only — same write path as `draft` (no status sent)
// but Save & Preview opens the public page in a new tab after save resolves.
// The status-carrying intents (`draft` | `publish`) stay create-mode-only.
type Intent = 'draft' | 'publish' | 'preview';

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

  // Section refs for scroll-to-first-invalid. The linear layout exposes
  // every section at once, so the old "open the failing accordion" trick
  // becomes "smooth-scroll to the failing section". Keyed by section id
  // (the only ids the validators surface in section order).
  const basicsRef   = useRef<HTMLElement>(null);
  const dateVenueRef = useRef<HTMLElement>(null);
  const capacityRef = useRef<HTMLElement>(null);
  const agendaRef   = useRef<HTMLElement>(null);

  const v1 = basicsValid(basics);
  const v2 = venueValid(venue);
  const v3 = dateTimeValid(datetime);
  const v4 = agendaValid(blocks, datetime.startMinutes, datetime.endMinutes);

  // Timezone hint: derived once per render from the picked venue's lat/long
  // via tz-lookup (pure, no I/O — same package the server action uses to
  // persist events.timezone, so this hint matches what gets stored on save).
  // Only shown once a venue is picked — before that the hint would be
  // meaningless and the user has no expectation of seeing one.
  const venueTz = venue ? safeTzFromVenue(venue) : null;

  function onSubmit(nextIntent: Intent) {
    setErr(null);
    setSavedAt(null);
    // Validate in section order; on the first failure, scroll the user to
    // that section and explain. Buttons stay enabled (disabled-with-no-reason
    // reads as "broken"), so the click is what surfaces what's still needed.
    if (!v1) {
      basicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setErr('Add the event basics (name) to continue.');
      return;
    }
    if (!v2) {
      dateVenueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setErr('Pick a venue from the dropdown to continue.');
      return;
    }
    if (!v3) {
      dateVenueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setErr('Set the date, start, and end time to continue.');
      return;
    }
    if (!v4) {
      agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Capture the edit-mode preview target BEFORE awaiting submit — props is
    // narrowed inside this closure, so we don't re-narrow after the await.
    const previewUrl = props.mode === 'edit' ? `/events/${props.eventId}` : null;
    const openPreview = nextIntent === 'preview';

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
        // Save & Preview path: open the public event page in a new tab AFTER
        // the save resolves ok. Use noopener,noreferrer so the popup can't
        // navigate this tab back (window.opener tampering surface) and the
        // referrer isn't leaked. Pop-up blockers may swallow this — accepted
        // tradeoff vs. opening before the save and then orphaning a tab if
        // the save fails.
        if (openPreview && previewUrl) {
          window.open(previewUrl, '_blank', 'noopener,noreferrer');
        }
        router.refresh();
        setIntent(null);
        setSavedAt(new Date());
      }
    });
  }

  function onCancel() {
    if (props.mode === 'edit') {
      router.push(`/events/${props.eventId}/details`);
    } else {
      router.push('/dashboard');
    }
  }

  const isEdit = props.mode === 'edit';

  return (
    <div className="pb-xxl space-y-xl">
      {/* Progress strip — section-by-section status. The four `v*` flags drive
          both this and the submit-time scroll-to-first-invalid path, so the
          UI can't drift from the actual validation. Completed steps go
          accent blue (Vercel-canonical "active focus"); incomplete steps
          stay neutral. Agenda is optional — its `v4` is true on empty, so
          it lights up as soon as the form loads. */}
      <ProgressStrip
        steps={[
          { n: '1', label: 'Basics',        complete: v1 },
          { n: '2', label: 'Date & venue',  complete: v2 && v3 },
          { n: '3', label: 'Capacity',      complete: !!basics.capacity },
          { n: '4', label: 'Agenda',        complete: v4, optional: true },
        ]}
      />

      {/* 1 · Basics */}
      <FormSection ref={basicsRef} number="1" title="Basics">
        <BasicsSection value={basics} onChange={(p) => setBasics({ ...basics, ...p })} />
      </FormSection>

      {/* 2 · Date & venue — DateTimeSection + VenueSection under one heading
          per the EE mockup. Date/time stays in its existing 2-col internal
          grid; venue picker sits below. Timezone hint only renders once a
          venue is picked (so the copy is grounded in a real zone string). */}
      <FormSection ref={dateVenueRef} number="2" title="Date & venue">
        <div className="space-y-lg">
          <DateTimeSection value={datetime} onChange={(p) => setDatetime({ ...datetime, ...p })} />
          <VenueSection value={venue} onChange={setVenue} />
          {venueTz && (
            <p
              className="font-body-md text-body-md text-on-surface-variant"
              data-testid="venue-tz-hint"
            >
              Times shown in {venueTz} — picked up from your venue.
            </p>
          )}
        </div>
      </FormSection>

      {/* 3 · Capacity — extracted from Basics so it gets its own numbered
          beat in the mockup. Same BasicsValue.capacity binding, so the
          submit payload is unchanged. */}
      <FormSection ref={capacityRef} number="3" title="Capacity">
        <CapacityField value={basics} onChange={(p) => setBasics({ ...basics, ...p })} />
      </FormSection>

      {/* 4 · Agenda (optional) */}
      <FormSection ref={agendaRef} number="4" title="Agenda" optional>
        <AgendaSection
          date={datetime.date}
          eventStartMinutes={datetime.startMinutes}
          eventEndMinutes={datetime.endMinutes}
          blocks={blocks}
          onChange={setBlocks}
        />
      </FormSection>

      {/* Bottom action row — Cancel · Save & Preview (edit-only) · Save.
          Save is the primary on the right. Mobile: stacks vertically. The
          old top button cluster is removed (the page header now owns the
          page title; this row owns the action surface). */}
      <div className="border-t border-outline-variant pt-lg flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-sm">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-sm sm:items-center">
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSubmit('preview')}
              disabled={pending}
            >
              {pending && intent === 'preview' ? 'Saving…' : 'Save & Preview'}
            </Button>
          )}
          {isEdit ? (
            <Button
              type="button"
              onClick={() => onSubmit('draft')}
              disabled={pending}
            >
              {pending && intent === 'draft' ? 'Saving…' : 'Save changes'}
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
      </div>

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
          <span className="flex-1">Saved.</span>
        </p>
      )}
    </div>
  );
}

/**
 * Numbered linear section per the EE mockup. The `ref` is forwarded onto
 * the outer <section> so the form's scroll-to-first-invalid can target it
 * by element. The heading reads `N · Title` to match `section-h2` in the
 * mockup (visually distinct from the page H1 which the page owns).
 */
function FormSection({
  ref,
  number,
  title,
  optional = false,
  children,
}: {
  ref?: React.Ref<HTMLElement>;
  number: string;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section ref={ref} className="space-y-md scroll-mt-grid-margin">
      <h2 className="font-headline-sm text-[20px] text-on-surface flex items-baseline gap-sm">
        <span className="text-tertiary font-bold">{number} ·</span>
        <span>{title}</span>
        {optional && (
          <span className="font-body-md text-body-md text-on-surface-variant font-normal">
            (optional)
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/**
 * Top-of-form progress strip. Four step chips in a horizontal row, each
 * showing the section number (or a checkmark when complete) plus its label.
 * Completed steps light up accent blue; the first incomplete step is the
 * implicit "current focus" for the user. Single source of truth for the
 * same booleans the submit-time validators check.
 */
function ProgressStrip({
  steps,
}: {
  steps: Array<{ n: string; label: string; complete: boolean; optional?: boolean }>;
}) {
  return (
    <ol
      aria-label="Form progress"
      className="m-0 p-md list-none flex items-center flex-wrap gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest"
    >
      {steps.map((step, i) => {
        const badgeClass = step.complete
          ? 'bg-tertiary text-on-tertiary border-transparent'
          : 'bg-surface-container border-outline-variant text-on-surface-variant';
        const labelClass = step.complete
          ? 'text-on-surface font-medium'
          : 'text-on-surface-variant';
        return (
          <li key={step.n} className="flex items-center gap-sm">
            <span
              aria-hidden
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-bold ${badgeClass}`}
            >
              {step.complete ? '✓' : step.n}
            </span>
            <span className={`text-sm ${labelClass}`}>
              {step.label}
              {step.optional && (
                <span className="text-on-surface-variant"> (optional)</span>
              )}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="mx-xs text-on-surface-variant">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * tz-lookup throws on out-of-range coords; defend with a try/catch so a
 * pathological venue (e.g. a manually-entered (0,0)) doesn't crash the form
 * — just hides the hint. The persisted timezone uses the same function in
 * the Server Action, so any failure there is the surface that owns the
 * recovery, not this client-side hint.
 */
function safeTzFromVenue(v: Venue): string | null {
  try {
    return tzFromCoords(v.latitude, v.longitude);
  } catch {
    return null;
  }
}
