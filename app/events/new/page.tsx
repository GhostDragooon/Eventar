'use client';

import { useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { createEvent } from './actions';
import type { Venue } from '@/lib/mapbox';
import { findParallelBlockIds } from '@/lib/agenda';

const VenueSearchBox = dynamic(() => import('@/components/VenueSearchBox'), { ssr: false });

type TopicDraft = {
  title: string;
  speaker_name: string;
  speaker_credential: string;
  speaker_affiliation: string;
};
type BlockKind =
  | 'workshop' | 'seminar' | 'webinar' | 'scientific_program'
  | 'panel' | 'roundtable' | 'keynote' | 'other'
  | 'break' | 'transition';
type BlockDraft = {
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
const FILLER_KINDS: readonly string[] = ['break','transition'];

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-2 focus:outline-black/10";
const btnSecondaryCls = "border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white";

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

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [capacity, setCapacity] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const components = blocks.filter(b => !FILLER_KINDS.includes(b.kind));
  const fillers    = blocks.filter(b =>  FILLER_KINDS.includes(b.kind));

  const parallelIds = useMemo(() => {
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  function updateBlock(localId: string, patch: Partial<BlockDraft>) {
    setBlocks(bs => bs.map(b => b.localId === localId ? { ...b, ...patch } : b));
  }
  function removeBlock(localId: string) {
    setBlocks(bs => bs.filter(b => b.localId !== localId));
  }
  function addBlock(kind: BlockKind) {
    setBlocks(bs => [...bs, emptyBlock(kind)]);
  }

  function onSubmit() {
    setErr(null);
    if (!venue) { setErr('Pick a venue from the dropdown'); return; }
    if (!date)  { setErr('Pick a date'); return; }
    if (!name)  { setErr('Enter an event name'); return; }

    const event = {
      title: name,
      description,
      start_time: new Date(`${date}T${startTime}:00`).toISOString(),
      end_time:   new Date(`${date}T${endTime}:00`).toISOString(),
      max_attendees: capacity || undefined,
      ...venue,
    };
    const blocksPayload = blocks.map((b, i) => ({
      start_time: new Date(`${date}T${b.start}:00`).toISOString(),
      end_time:   new Date(`${date}T${b.end}:00`).toISOString(),
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
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">New event</h1>

      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <h2 className="text-lg font-medium">Event basics</h2>

        <Labelled label="Event Name">
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} required />
        </Labelled>

        <Labelled label="Description">
          <textarea className={inputCls} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </Labelled>

        <Labelled label="Location">
          <VenueSearchBox token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!} onSelect={setVenue} />
          {venue && (
            <p className="text-xs text-gray-600 mt-1">
              📍 {venue.venue_name} — {venue.city}{venue.region ? `, ${venue.region}` : ''}, {venue.country}
            </p>
          )}
        </Labelled>

        <Labelled label="Capacity (optional)">
          <input className={inputCls} type="number" min={1} value={capacity} onChange={e => setCapacity(e.target.value)} />
        </Labelled>

        <Labelled label="Date">
          <input className={inputCls} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </Labelled>

        <div className="grid grid-cols-2 gap-4">
          <Labelled label="Start"><input className={inputCls} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required /></Labelled>
          <Labelled label="End"><input className={inputCls} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required /></Labelled>
        </div>
      </section>

      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Program</h2>
          <select
            className={`${inputCls} w-auto`}
            value=""
            onChange={e => {
              if (!e.target.value) return;
              addBlock(e.target.value as BlockKind);
              e.target.value = '';
            }}
          >
            <option value="">+ Add component…</option>
            {RICH_KINDS.map(k => <option key={k} value={k}>{labelForKind(k)}</option>)}
          </select>
        </header>
        {components.length === 0 && <p className="text-sm text-gray-500">No components yet.</p>}
        {components.map(b => (
          <BlockEditor
            key={b.localId}
            block={b}
            parallel={parallelIds.has(b.localId)}
            onChange={patch => updateBlock(b.localId, patch)}
            onRemove={() => removeBlock(b.localId)}
          />
        ))}
      </section>

      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Breaks & transitions</h2>
          <div className="flex gap-2">
            <button type="button" className={btnSecondaryCls} onClick={() => addBlock('break')}>+ Break</button>
            <button type="button" className={btnSecondaryCls} onClick={() => addBlock('transition')}>+ Transition</button>
          </div>
        </header>
        {fillers.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {fillers.map(b => (
          <FillerEditor key={b.localId} block={b} onChange={patch => updateBlock(b.localId, patch)} onRemove={() => removeBlock(b.localId)} />
        ))}
      </section>

      <div className="flex items-center justify-end gap-3">
        {err && <p className="text-sm text-red-700 mr-auto whitespace-pre-wrap">{err}</p>}
        <button type="button" disabled={pending} onClick={onSubmit} className="rounded-md bg-black text-white px-4 py-2 font-medium disabled:opacity-50">
          {pending ? 'Saving…' : 'Save as draft'}
        </button>
      </div>
    </main>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function labelForKind(k: string): string {
  const map: Record<string, string> = {
    workshop: 'Workshop', seminar: 'Seminar', webinar: 'Webinar',
    scientific_program: 'Scientific Program', panel: 'Panel',
    roundtable: 'Roundtable', keynote: 'Keynote', other: 'Other',
    break: 'Break', transition: 'Transition',
  };
  return map[k] ?? k;
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
