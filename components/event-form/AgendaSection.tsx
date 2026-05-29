'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { findParallelBlockIds } from '@/lib/agenda';

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
const inputBase = "w-full border rounded-lg px-md py-sm bg-surface-container-lowest text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-colors";
const inputOk   = "border-outline-variant focus:border-primary focus:ring-primary";
// Signal Red — applied per the user's instruction for missing essential entries.
const inputErr  = "border-error focus:border-error focus:ring-error/40 bg-error-container/10";

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

/* ─── Validation helpers (pure) ───────────────────────────────────────── */

function isHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}
function hhmmToMinutes(s: string): number | null {
  if (!isHHMM(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
function durationMinutes(start: string, end: string): number | null {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return e - s;
}
function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function topicHasErrors(t: TopicDraft): boolean {
  return !t.title.trim() || !t.speaker_name.trim();
}
type BlockErrors = {
  start: boolean;
  end: boolean;
  endBeforeStart: boolean;
  title: boolean;
  topicIndices: number[];
};
function blockErrors(block: BlockDraft): BlockErrors {
  const startOk = isHHMM(block.start);
  const endOk = isHHMM(block.end);
  const endBeforeStart = startOk && endOk && (hhmmToMinutes(block.end)! <= hhmmToMinutes(block.start)!);
  const titleMissing = !block.title.trim();
  const topicIndices = block.topics.map((t, i) => topicHasErrors(t) ? i : -1).filter(i => i >= 0);
  return {
    start: !startOk,
    end: !endOk,
    endBeforeStart,
    title: titleMissing,
    topicIndices,
  };
}
function blockHasErrors(e: BlockErrors): boolean {
  return e.start || e.end || e.endBeforeStart || e.title || e.topicIndices.length > 0;
}

type Props = {
  date: string;
  blocks: BlockDraft[];
  onChange: (blocks: BlockDraft[]) => void;
};

export default function AgendaSection({ date, blocks, onChange }: Props) {
  const components = blocks.filter(b => !FILLER_KINDS.includes(b.kind));
  const fillers    = blocks.filter(b =>  FILLER_KINDS.includes(b.kind));

  const parallelIds = useMemo(() => {
    if (!date) return new Set<string>();  // no date yet → don't fabricate `T${time}` keys
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  // Touched-set: a block becomes "touched" once any field in it receives a
  // blur event. Until touched, the block does NOT show signal-red — it's a
  // freshly-added empty card. This avoids the hostile UX of screaming
  // errors immediately on add.
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
      {/* Components */}
      <section className="space-y-md">
        <header className="flex items-center justify-between gap-sm flex-wrap">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Components
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
 * blocks, each block must pass the same essential-field check the per-block
 * red shell uses. Without this, bad blocks slip to the server and surface
 * as opaque Zod errors there (rule #12 — fail visibly at the boundary
 * closest to the user).
 */
export function agendaValid(blocks: BlockDraft[]): boolean {
  return blocks.every(b => !blockHasErrors(blockErrors(b)));
}

/* ===== Block editors (lifted verbatim from Phase 1.5 page.tsx) ===== */

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
 * TimeRow: implements T20 — entry-first time selector.
 * - Start input is always visible.
 * - End input only appears once Start has a value. (Lower friction; you
 *   pick End once you know where you're starting from.)
 * - Duration strip + label show under the row once BOTH are valid and
 *   end > start. Error message shows if end <= start.
 *
 * The "bar" the user asked for is the duration strip — a horizontal
 * line whose width reflects the block's duration on a 0–8h scale (8h
 * being a long-form workshop, the longest sensible single-block duration).
 */
function TimeRow({
  start,
  end,
  errors,
  touched,
  onChange,
  onBlur,
}: {
  start: string;
  end: string;
  errors: BlockErrors;
  touched: boolean;
  onChange: (patch: { start?: string; end?: string }) => void;
  onBlur: () => void;
}) {
  const dur = durationMinutes(start, end);
  const showStartErr = touched && errors.start;
  const showEndErr   = touched && (errors.end || errors.endBeforeStart);
  const showEndInput = isHHMM(start);

  // Duration bar scale: clamp 0–8h to 0–100%. 8h max keeps the bar useful
  // for typical 30-min to multi-hour blocks without being dwarfed by edge
  // cases (overnight events round to 100% — that's fine, those are rare).
  const barPct = dur !== null ? Math.min(100, (dur / (8 * 60)) * 100) : 0;

  return (
    <div className="space-y-sm">
      <div className="grid grid-cols-2 gap-md">
        <Labelled label="Start" required>
          <input
            className={`${inputBase} ${showStartErr ? inputErr : inputOk}`}
            type="time"
            value={start}
            onChange={e => onChange({ start: e.target.value })}
            onBlur={onBlur}
            aria-invalid={showStartErr || undefined}
          />
        </Labelled>
        {showEndInput ? (
          <Labelled label="End" required>
            <input
              className={`${inputBase} ${showEndErr ? inputErr : inputOk}`}
              type="time"
              value={end}
              onChange={e => onChange({ end: e.target.value })}
              onBlur={onBlur}
              aria-invalid={showEndErr || undefined}
            />
          </Labelled>
        ) : (
          <div
            className="flex items-end pb-sm font-body-md text-body-md text-on-surface-variant italic"
            aria-hidden
          >
            End time appears once Start is set.
          </div>
        )}
      </div>

      {/* Duration strip + label — appears once both are filled and valid. */}
      {dur !== null && (
        <div className="flex items-center gap-sm">
          <div
            className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden"
            aria-hidden
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant whitespace-nowrap">
            {formatDuration(dur)}
          </span>
        </div>
      )}
      {touched && errors.endBeforeStart && (
        <p className="font-body-md text-body-md text-error flex items-center gap-xs">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>warning</span>
          End must be after Start.
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
  if (missing.length === 0 && !errors.endBeforeStart) return null;
  if (errors.endBeforeStart && missing.length === 0) return null; // surfaced inline already

  return (
    <p
      role="alert"
      className="font-body-md text-body-md text-error bg-error-container/20 border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
    >
      <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>warning</span>
      <span>
        Please enter a valid {missing.join(' and ')} to continue.
      </span>
    </p>
  );
}

function BlockEditor({ block, parallel, touched, onTouch, onChange, onRemove }: {
  block: BlockDraft; parallel: boolean; touched: boolean;
  onTouch: () => void;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  const errors = blockErrors(block);
  const showRedShell = touched && blockHasErrors(errors);

  return (
    <div
      className={
        'rounded-[20px] p-md space-y-md bg-surface-container-lowest border-2 transition-colors ' +
        (showRedShell ? 'border-error' : 'border-outline-variant')
      }
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <span className="font-label-md text-label-md uppercase tracking-wider bg-on-surface text-surface-container-lowest px-sm py-xs rounded">
            {labelForKind(block.kind)}
          </span>
          {parallel && (
            <span className="font-label-md text-label-md bg-tertiary-fixed text-on-tertiary-fixed-variant px-sm py-xs rounded">
              ⚠ Parallel session
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="font-label-md text-label-md text-error hover:underline"
        >
          Remove
        </button>
      </header>

      <TimeRow
        start={block.start}
        end={block.end}
        errors={errors}
        touched={touched}
        onChange={(patch) => onChange(patch)}
        onBlur={onTouch}
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
            className="font-label-md text-label-md text-primary hover:underline"
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
                (showTopicRed ? 'border-error bg-error-container/5' : 'border-outline-variant')
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

function FillerEditor({ block, touched, onTouch, onChange, onRemove }: {
  block: BlockDraft; touched: boolean;
  onTouch: () => void;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  const errors = blockErrors(block);
  const showRedShell = touched && blockHasErrors(errors);

  return (
    <div
      className={
        'rounded-[20px] p-md space-y-sm bg-surface-container-lowest border-2 transition-colors ' +
        (showRedShell ? 'border-error' : 'border-outline-variant')
      }
    >
      <div className="grid grid-cols-12 gap-sm items-end">
        <div className="col-span-12 md:col-span-3">
          <Labelled label="Start" required>
            <input
              className={`${inputBase} ${touched && errors.start ? inputErr : inputOk}`}
              type="time"
              value={block.start}
              onChange={e => onChange({ start: e.target.value })}
              onBlur={onTouch}
              aria-invalid={(touched && errors.start) || undefined}
            />
          </Labelled>
        </div>
        <div className="col-span-12 md:col-span-3">
          {isHHMM(block.start) ? (
            <Labelled label="End" required>
              <input
                className={`${inputBase} ${touched && (errors.end || errors.endBeforeStart) ? inputErr : inputOk}`}
                type="time"
                value={block.end}
                onChange={e => onChange({ end: e.target.value })}
                onBlur={onTouch}
                aria-invalid={(touched && (errors.end || errors.endBeforeStart)) || undefined}
              />
            </Labelled>
          ) : (
            <div className="font-body-md text-[12px] text-on-surface-variant italic pb-sm">
              End time appears once Start is set.
            </div>
          )}
        </div>
        <div className="col-span-12 md:col-span-5">
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
        </div>
        <div className="col-span-12 md:col-span-1 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="font-label-md text-label-md text-error hover:underline pb-sm"
            aria-label="Remove block"
          >
            ×
          </button>
        </div>
      </div>

      {/* Duration strip + error inline (same affordance as rich block) */}
      {(() => {
        const dur = durationMinutes(block.start, block.end);
        if (dur !== null) {
          const barPct = Math.min(100, (dur / (8 * 60)) * 100);
          return (
            <div className="flex items-center gap-sm">
              <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden" aria-hidden>
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${barPct}%` }} />
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant whitespace-nowrap">
                {formatDuration(dur)}
              </span>
            </div>
          );
        }
        if (touched && errors.endBeforeStart) {
          return (
            <p className="font-body-md text-body-md text-error flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>warning</span>
              End must be after Start.
            </p>
          );
        }
        return null;
      })()}

      {touched && <BlockErrorBanner errors={errors} kindLabel="filler" />}
    </div>
  );
}
