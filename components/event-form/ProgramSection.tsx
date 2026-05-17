'use client';

import { useMemo } from 'react';
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

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-2 focus:outline-black/10";

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

type Props = {
  date: string;
  blocks: BlockDraft[];
  onChange: (blocks: BlockDraft[]) => void;
};

export default function ProgramSection({ date, blocks, onChange }: Props) {
  const components = blocks.filter(b => !FILLER_KINDS.includes(b.kind));
  const fillers    = blocks.filter(b =>  FILLER_KINDS.includes(b.kind));

  const parallelIds = useMemo(() => {
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  function update(localId: string, patch: Partial<BlockDraft>) {
    onChange(blocks.map(b => b.localId === localId ? { ...b, ...patch } : b));
  }
  function remove(localId: string) {
    onChange(blocks.filter(b => b.localId !== localId));
  }
  function add(kind: BlockKind) {
    onChange([...blocks, emptyBlock(kind)]);
  }

  return (
    <div className="space-y-6">
      {/* Components */}
      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium">Components</h3>
          <div className="flex gap-1 flex-wrap">
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
        {components.length === 0 && <p className="text-sm text-gray-500">No components yet.</p>}
        {components.map(b => (
          <BlockEditor
            key={b.localId}
            block={b}
            parallel={parallelIds.has(b.localId)}
            onChange={(patch) => update(b.localId, patch)}
            onRemove={() => remove(b.localId)}
          />
        ))}
      </section>

      {/* Fillers */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Breaks & transitions</h3>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => add('break')}>+ Break</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => add('transition')}>+ Transition</Button>
          </div>
        </header>
        {fillers.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {fillers.map(b => (
          <FillerEditor
            key={b.localId}
            block={b}
            onChange={(patch) => update(b.localId, patch)}
            onRemove={() => remove(b.localId)}
          />
        ))}
      </section>
    </div>
  );
}

export function programSummary(blocks: BlockDraft[], parallelIds: Set<string>): string {
  const cs = blocks.filter(b => !FILLER_KINDS.includes(b.kind)).length;
  const fs = blocks.filter(b =>  FILLER_KINDS.includes(b.kind)).length;
  const flag = parallelIds.size > 0 ? ' · ⚠ parallel' : '';
  return `${cs} component${cs === 1 ? '' : 's'} · ${fs} break${fs === 1 ? '' : 's'}${flag}`;
}

export function programValid(_blocks: BlockDraft[]): boolean {
  return true; // Program is optional for a draft.
}

/* ===== Block editors (lifted verbatim from Phase 1.5 page.tsx) ===== */

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function BlockEditor({ block, parallel, onChange, onRemove }: {
  block: BlockDraft; parallel: boolean;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border rounded-xl p-4 space-y-3 bg-gray-50/30">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide bg-black text-white px-2 py-0.5 rounded">{labelForKind(block.kind)}</span>
          {parallel && <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded">⚠ Parallel session</span>}
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-red-700 hover:underline">Remove</button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Labelled label="Start"><input className={inputCls} type="time" value={block.start} onChange={e => onChange({ start: e.target.value })} /></Labelled>
        <Labelled label="End"><input className={inputCls} type="time" value={block.end} onChange={e => onChange({ end: e.target.value })} /></Labelled>
      </div>
      <Labelled label="Title">
        <input className={inputCls} value={block.title} onChange={e => onChange({ title: e.target.value })} />
      </Labelled>
      <Labelled label="Host / Chairperson">
        <input className={inputCls} value={block.host} onChange={e => onChange({ host: e.target.value })} />
      </Labelled>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Topics</span>
          <button type="button" onClick={() => onChange({ topics: [...block.topics, emptyTopic()] })} className="text-xs text-blue-700 hover:underline">+ Add topic</button>
        </div>
        {block.topics.map((t, i) => (
          <div key={i} className="border rounded-lg p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Topic {i + 1}</span>
              <button type="button" onClick={() => onChange({ topics: block.topics.filter((_, j) => j !== i) })} className="text-xs text-red-700 hover:underline">Remove</button>
            </div>
            <Labelled label="Topic title"><input className={inputCls} value={t.title} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} /></Labelled>
            <Labelled label="Speaker name"><input className={inputCls} value={t.speaker_name} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_name: e.target.value } : x) })} /></Labelled>
            <Labelled label="Credential"><input className={inputCls} value={t.speaker_credential} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_credential: e.target.value } : x) })} /></Labelled>
            <Labelled label="Affiliation"><input className={inputCls} value={t.speaker_affiliation} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_affiliation: e.target.value } : x) })} /></Labelled>
          </div>
        ))}
      </div>
    </div>
  );
}

function FillerEditor({ block, onChange, onRemove }: {
  block: BlockDraft;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border rounded-xl p-3 grid grid-cols-12 gap-2 items-end">
      <div className="col-span-3"><Labelled label="Start"><input className={inputCls} type="time" value={block.start} onChange={e => onChange({ start: e.target.value })} /></Labelled></div>
      <div className="col-span-3"><Labelled label="End"><input className={inputCls} type="time" value={block.end} onChange={e => onChange({ end: e.target.value })} /></Labelled></div>
      <div className="col-span-5"><Labelled label="What"><input className={inputCls} placeholder={block.kind === 'break' ? 'Lunch / coffee' : 'Walk to room B'} value={block.title} onChange={e => onChange({ title: e.target.value })} /></Labelled></div>
      <div className="col-span-1"><button type="button" onClick={onRemove} className="text-xs text-red-700 hover:underline">×</button></div>
    </div>
  );
}
