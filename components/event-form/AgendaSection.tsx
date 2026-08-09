'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { findParallelBlockIds } from '@/lib/agenda';
import { TimePicker15 } from './TimePicker15';

export type TopicDraft = {
  title: string;
  speaker_name: string;
  speaker_credential: string;
  speaker_affiliation: string;
};

export type BlockKind =
  | 'workshop' | 'seminar' | 'webinar' | 'scientific_program'
  | 'panel' | 'roundtable' | 'keynote' | 'other'
  | 'break' | 'transition';

export type BlockDraft = {
  localId: string;
  start: string;   // HH:MM
  end: string;     // HH:MM
  kind: BlockKind;
  title: string;
  host: string;
  topics: TopicDraft[];
  notes: string;
};

const RICH_KINDS = ['workshop','seminar','webinar','scientific_program','panel','roundtable','keynote','other'] as const;
const FILLER_KINDS: readonly BlockKind[] = ['break','transition'];

// Base input styling; appended with error variant when touched && invalid.
const inputBase = "w-full border rounded-lg px-md py-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-colors";
const inputOk   = "bg-surface-container-lowest border-outline-variant focus:border-primary focus:ring-primary";
// Signal Red — applied per the user's instruction for missing essential entries.
const inputErr  = "border-error focus:border-error focus:ring-error/40 bg-error-container";

function emptyTopic(): TopicDraft {
  return { title: '', speaker_name: '', speaker_credential: '', speaker_affiliation: '' };
}
function emptyBlock(kind: BlockKind): BlockDraft {
  return {
    localId: crypto.randomUUID(),
    start: '', end: '', kind, title: '', host: '',
    topics: kind === 'break' || kind === 'transition' ? [] : [emptyTopic()],
    notes: '',
  };
}

function labelForKind(k: BlockKind): string {
  const map: Record<BlockKind, string> = {
    workshop: 'Workshop', seminar: 'Seminar', webinar: 'Webinar',
    scientific_program: 'Scientific Program', panel: 'Panel',
    roundtable: 'Roundtable', keynote: 'Keynote', other: 'Other',
    break: 'Break', transition: 'Transition',
  };
  return map[k];
}

/* ─── Time helpers (HH:MM ⇄ minutes) ─────────────────────────────────── */

function isHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}
function hhmmToMinutes(s: string): number | null {
  if (!isHHMM(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
function hhmmFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ─── Validation (pure) ──────────────────────────────────────────────── */

function topicHasErrors(t: TopicDraft): boolean {
  return !t.title.trim() || !t.speaker_name.trim();
}
type BlockErrors = {
  start: boolean;
  end: boolean;
  endBeforeStart: boolean;
  envelope: boolean;     // block falls outside the event's start/end window
  title: boolean;
  topicIndices: number[];
};
function blockErrors(
  block: BlockDraft,
  eventStartMin: number | null,
  eventEndMin: number | null,
): BlockErrors {
  const startOk = isHHMM(block.start);
  const endOk = isHHMM(block.end);
  const bs = hhmmToMinutes(block.start);
  const be = hhmmToMinutes(block.end);
  const endBeforeStart = bs !== null && be !== null && be <= bs;
  // Envelope: only checkable when both the event window AND this block's
  // times are fully set. If unknown, don't flag (other errors cover gaps).
  const envelope =
    eventStartMin !== null && eventEndMin !== null &&
    bs !== null && be !== null &&
    (bs < eventStartMin || be > eventEndMin);
  const titleMissing = !block.title.trim();
  const topicIndices = block.topics.map((t, i) => topicHasErrors(t) ? i : -1).filter(i => i >= 0);
  return {
    start: !startOk,
    end: !endOk,
    endBeforeStart,
    envelope,
    title: titleMissing,
    topicIndices,
  };
}
function blockHasErrors(e: BlockErrors): boolean {
  return e.start || e.end || e.endBeforeStart || e.envelope || e.title || e.topicIndices.length > 0;
}

type Props = {
  date: string;
  eventStartMinutes: number | null;
  eventEndMinutes: number | null;
  blocks: BlockDraft[];
  onChange: (blocks: BlockDraft[]) => void;
};

export default function AgendaSection({
  date,
  eventStartMinutes,
  eventEndMinutes,
  blocks,
  onChange,
}: Props) {
  const components = blocks.filter(b => !FILLER_KINDS.includes(b.kind));
  const fillers    = blocks.filter(b =>  FILLER_KINDS.includes(b.kind));

  const parallelIds = useMemo(() => {
    if (!date) return new Set<string>();  // no date yet → don't fabricate `T${time}` keys
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  // Touched-set: a block becomes "touched" once the user interacts with any
  // field in it (picks a time, or blurs a text field). Until touched, the
  // block does NOT show signal-red — it's a freshly-added empty card. This
  // avoids the hostile UX of screaming errors immediately on add.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  function markTouched(localId: string) {
    setTouched(prev => {
      if (prev.has(localId)) return prev;
      const next = new Set(prev);
      next.add(localId);
      return next;
    });
  }

  function update(localId: string, patch: Partial<BlockDraft>) {
    onChange(blocks.map(b => b.localId === localId ? { ...b, ...patch } : b));
  }
  function remove(localId: string) {
    onChange(blocks.filter(b => b.localId !== localId));
    setTouched(prev => {
      if (!prev.has(localId)) return prev;
      const next = new Set(prev);
      next.delete(localId);
      return next;
    });
  }
  function add(kind: BlockKind) {
    onChange([...blocks, emptyBlock(kind)]);
  }

  return (
    <div className="space-y-lg">
      {/* Components — header reads "Event type" per the locked terminology
          (patterns doc §7). The DB column stays `kind`; only the user-facing
          label changes. The +Workshop/+Seminar/... buttons each create a
          block of that event type. */}
      <section className="space-y-md">
        <header className="flex items-center justify-between gap-sm flex-wrap">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Event type
          </h3>
          <div className="flex gap-xs flex-wrap">
            {RICH_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => add(k)}
              >
                + {labelForKind(k)}
              </Button>
            ))}
          </div>
        </header>
        {components.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">No components yet.</p>
        )}
        {components.map(b => (
          <BlockEditor
            key={b.localId}
            block={b}
            parallel={parallelIds.has(b.localId)}
            touched={touched.has(b.localId)}
            errors={blockErrors(b, eventStartMinutes, eventEndMinutes)}
            onTouch={() => markTouched(b.localId)}
            onChange={(patch) => update(b.localId, patch)}
            onRemove={() => remove(b.localId)}
          />
        ))}
      </section>

      {/* Fillers */}
      <section className="space-y-md">
        <header className="flex items-center justify-between">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Breaks &amp; transitions
          </h3>
          <div className="flex gap-sm">
            <Button type="button" variant="outline" size="sm" onClick={() => add('break')}>+ Break</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => add('transition')}>+ Transition</Button>
          </div>
        </header>
        {fillers.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">None.</p>
        )}
        {fillers.map(b => (
          <FillerEditor
            key={b.localId}
            block={b}
            touched={touched.has(b.localId)}
            errors={blockErrors(b, eventStartMinutes, eventEndMinutes)}
            onTouch={() => markTouched(b.localId)}
            onChange={(patch) => update(b.localId, patch)}
            onRemove={() => remove(b.localId)}
          />
        ))}
      </section>
    </div>
  );
}

export function agendaSummary(blocks: BlockDraft[], parallelIds: Set<string>): string {
  const cs = blocks.filter(b => !FILLER_KINDS.includes(b.kind)).length;
  const fs = blocks.filter(b =>  FILLER_KINDS.includes(b.kind)).length;
  const flag = parallelIds.size > 0 ? ' · ⚠ parallel' : '';
  return `${cs} component${cs === 1 ? '' : 's'} · ${fs} break${fs === 1 ? '' : 's'}${flag}`;
}

/**
 * Agenda is optional — an empty agenda is valid. But if the user has added
 * blocks, each block must pass essential-field + window checks (the same
 * ones the per-block red shell uses). Without this, bad blocks slip to the
 * server and surface as opaque Zod / envelope errors there only after the
 * user clicks Publish (rule #12 — fail visibly, at the boundary closest to
 * the user). The event window is threaded in so the envelope check
 * (block fits inside event start/end) can run client-side.
 */
export function agendaValid(
  blocks: BlockDraft[],
  eventStartMinutes: number | null,
  eventEndMinutes: number | null,
): boolean {
  return blocks.every(b => !blockHasErrors(blockErrors(b, eventStartMinutes, eventEndMinutes)));
}

/* ===== Block editors ===== */

function Labelled({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
        {label}{required && <span className="text-error ml-xs" aria-label="required">*</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Two 15-minute TimePicker15 popovers. The End picker stays disabled until
 * Start is set (entry-first — you pick End once you know the start). The
 * duration bar that used to live here moved to the event-level Date & Time
 * section per user feedback; agenda blocks only need the two pickers plus
 * inline error messages (end-before-start, outside-window).
 */
function TimeFields({
  block,
  errors,
  touched,
  onChange,
  onTouch,
}: {
  block: BlockDraft;
  errors: BlockErrors;
  touched: boolean;
  onChange: (patch: { start?: string; end?: string }) => void;
  onTouch: () => void;
}) {
  const startMin = hhmmToMinutes(block.start);
  const endMin = hhmmToMinutes(block.end);
  const showStartErr = touched && (errors.start || errors.envelope);
  const showEndErr   = touched && (errors.end || errors.endBeforeStart || errors.envelope);

  return (
    <div className="space-y-sm">
      <div className="grid grid-cols-2 gap-md">
        <Labelled label="Start" required>
          <TimePicker15
            value={startMin}
            onChange={(m) => { onChange({ start: hhmmFromMinutes(m) }); onTouch(); }}
            invalid={showStartErr}
            ariaLabel="Block start time (required)"
          />
        </Labelled>
        <Labelled label="End" required>
          <TimePicker15
            value={endMin}
            onChange={(m) => { onChange({ end: hhmmFromMinutes(m) }); onTouch(); }}
            invalid={showEndErr}
            disabled={startMin === null}
            ariaLabel="Block end time (required) — pick a start time first if disabled"
          />
        </Labelled>
      </div>
      {touched && errors.endBeforeStart && (
        <p className="font-body-md text-body-md text-error flex items-center gap-xs">
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>warning</span>
          End must be after Start.
        </p>
      )}
      {touched && errors.envelope && !errors.endBeforeStart && (
        <p className="font-body-md text-body-md text-error flex items-center gap-xs">
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>warning</span>
          This block runs outside the event&apos;s start/end window.
        </p>
      )}
    </div>
  );
}

function BlockErrorBanner({
  errors,
  kindLabel,
}: {
  errors: BlockErrors;
  kindLabel: 'rich' | 'filler';
}) {
  const missing: string[] = [];
  if (errors.start) missing.push('start time');
  if (errors.end) missing.push('end time');
  if (errors.title) missing.push(kindLabel === 'rich' ? 'title' : 'what');
  if (errors.topicIndices.length > 0) {
    missing.push(`topic ${errors.topicIndices.map(i => i + 1).join(', ')} (title + speaker)`);
  }
  // endBeforeStart and envelope are surfaced inline by TimeFields; the banner
  // only covers missing required fields. If the only problems are time-order
  // / window ones, the banner stays silent (no duplicate messaging).
  if (missing.length === 0) return null;

  return (
    <p
      role="alert"
      className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
    >
      <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>warning</span>
      <span>
        Please enter a valid {missing.join(' and ')} to continue.
      </span>
    </p>
  );
}

/**
 * Block header per user feedback: kind badge (outline, no fill) immediately
 * followed by the Remove button (filled red) — both anchored top-left. This
 * "flips" the prior design (kind was filled, Remove was text-only). The
 * filled-red Remove anchoring the left edge reads as more visually
 * deliberate. The optional Parallel-session flag floats to the right.
 */
function BlockHeader({
  kind,
  parallel,
  onRemove,
}: {
  kind: BlockKind;
  parallel: boolean;
  onRemove: () => void;
}) {
  return (
    <header className="flex items-center gap-sm flex-wrap">
      <span
        aria-label={`Event type: ${labelForKind(kind)}`}
        className="font-label-md text-label-md uppercase tracking-wider border border-outline-variant text-on-surface-variant px-sm py-xs rounded"
      >
        {labelForKind(kind)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="font-label-md text-label-md uppercase tracking-wider bg-error text-on-error px-sm py-xs rounded hover:opacity-90 transition-opacity"
      >
        Remove
      </button>
      {parallel && (
        <span className="ml-auto font-label-md text-label-md bg-tertiary-fixed text-on-tertiary-fixed-variant px-sm py-xs rounded">
          ⚠ Parallel session
        </span>
      )}
    </header>
  );
}

function BlockEditor({ block, parallel, touched, errors, onTouch, onChange, onRemove }: {
  block: BlockDraft; parallel: boolean; touched: boolean; errors: BlockErrors;
  onTouch: () => void;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  const showRedShell = touched && blockHasErrors(errors);

  return (
    <div
      className={
        'rounded-[20px] p-md space-y-md bg-surface-container-lowest border-2 transition-colors ' +
        (showRedShell ? 'border-error' : 'border-outline-variant')
      }
    >
      <BlockHeader kind={block.kind} parallel={parallel} onRemove={onRemove} />

      <TimeFields
        block={block}
        errors={errors}
        touched={touched}
        onChange={(patch) => onChange(patch)}
        onTouch={onTouch}
      />

      <Labelled label="Title" required>
        <input
          className={`${inputBase} ${touched && errors.title ? inputErr : inputOk}`}
          value={block.title}
          onChange={e => onChange({ title: e.target.value })}
          onBlur={onTouch}
          aria-invalid={(touched && errors.title) || undefined}
        />
      </Labelled>
      <Labelled label="Host / Chairperson">
        <input
          className={`${inputBase} ${inputOk}`}
          value={block.host}
          onChange={e => onChange({ host: e.target.value })}
          onBlur={onTouch}
        />
      </Labelled>

      <div>
        <div className="flex items-center justify-between mb-sm">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface">
            Topics
          </span>
          <button
            type="button"
            onClick={() => onChange({ topics: [...block.topics, emptyTopic()] })}
            className="font-label-md text-label-md text-primary-ink hover:underline"
          >
            + Add topic
          </button>
        </div>
        {block.topics.map((t, i) => {
          const tErr = topicHasErrors(t);
          const showTopicRed = touched && tErr;
          return (
            <div
              key={i}
              className={
                'rounded-lg p-md mb-sm space-y-sm border ' +
                (showTopicRed ? 'border-error' : 'border-outline-variant')
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  Topic {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ topics: block.topics.filter((_, j) => j !== i) })}
                  className="font-label-md text-label-md text-error hover:underline"
                >
                  Remove
                </button>
              </div>
              <Labelled label="Topic title" required>
                <input
                  className={`${inputBase} ${touched && !t.title.trim() ? inputErr : inputOk}`}
                  value={t.title}
                  onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                  onBlur={onTouch}
                />
              </Labelled>
              <Labelled label="Speaker name" required>
                <input
                  className={`${inputBase} ${touched && !t.speaker_name.trim() ? inputErr : inputOk}`}
                  value={t.speaker_name}
                  onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_name: e.target.value } : x) })}
                  onBlur={onTouch}
                />
              </Labelled>
              <Labelled label="Credential">
                <input
                  className={`${inputBase} ${inputOk}`}
                  value={t.speaker_credential}
                  onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_credential: e.target.value } : x) })}
                  onBlur={onTouch}
                />
              </Labelled>
              <Labelled label="Affiliation">
                <input
                  className={`${inputBase} ${inputOk}`}
                  value={t.speaker_affiliation}
                  onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_affiliation: e.target.value } : x) })}
                  onBlur={onTouch}
                />
              </Labelled>
            </div>
          );
        })}
      </div>

      {touched && <BlockErrorBanner errors={errors} kindLabel="rich" />}
    </div>
  );
}

function FillerEditor({ block, touched, errors, onTouch, onChange, onRemove }: {
  block: BlockDraft; touched: boolean; errors: BlockErrors;
  onTouch: () => void;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  const showRedShell = touched && blockHasErrors(errors);

  return (
    <div
      className={
        'rounded-[20px] p-md space-y-md bg-surface-container-lowest border-2 transition-colors ' +
        (showRedShell ? 'border-error' : 'border-outline-variant')
      }
    >
      <BlockHeader kind={block.kind} parallel={false} onRemove={onRemove} />

      <TimeFields
        block={block}
        errors={errors}
        touched={touched}
        onChange={(patch) => onChange(patch)}
        onTouch={onTouch}
      />

      <Labelled label="What" required>
        <input
          className={`${inputBase} ${touched && errors.title ? inputErr : inputOk}`}
          placeholder={block.kind === 'break' ? 'Lunch / coffee' : 'Walk to room B'}
          value={block.title}
          onChange={e => onChange({ title: e.target.value })}
          onBlur={onTouch}
          aria-invalid={(touched && errors.title) || undefined}
        />
      </Labelled>

      {touched && <BlockErrorBanner errors={errors} kindLabel="filler" />}
    </div>
  );
}
