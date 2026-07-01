'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

export type WorkstationEvent = {
  id: string;
  title: string;
  description: string | null;
  lifecycle: Lifecycle;
  startMs: number;
  dateLabel: string;
  timeLabel: string;
  venueName: string | null;
  maxAttendees: number | null;
  registered: number;
  attended: number;
  delta7: number;
  closesInDays: number | null; // days until registration_close_at, null if none/past
};

export type DashboardMetrics = {
  openRegistered: number;
  registered7d: number;
  eventsThisWeek: number;
  closingSoon: number;
};

// Instructional color: green=live/go, blue=action, amber=hold, red=stopped,
// neutral=context. One pill treatment per lifecycle, used everywhere.
const PILL: Record<Lifecycle, { label: string; cls: string; dot: string }> = {
  live:        { label: 'Live',        cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  registering: { label: 'Registering', cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  upcoming:    { label: 'Upcoming',    cls: 'bg-primary-container text-on-primary-container',  dot: 'bg-[color:var(--on-primary-container)]' },
  drafted:     { label: 'Draft',       cls: 'bg-warning-container text-[color:var(--on-surface)]', dot: 'bg-[color:var(--warning)]' },
  completed:   { label: 'Completed',   cls: 'bg-surface-container-high text-on-surface-variant', dot: 'bg-outline' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-error-container text-[color:var(--error)]', dot: 'bg-[color:var(--error)]' },
};

const FILTERS: { key: Lifecycle | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafted', label: 'Draft' },
  { key: 'registering', label: 'Registering' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'live', label: 'Live' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

type SortKey = 'soonest' | 'recent' | 'most';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'recent', label: 'Most recent' },
  { key: 'most', label: 'Most registered' },
];

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function DashboardWorkstation({
  events,
  greetingName,
  greeting,
  metrics,
}: {
  events: WorkstationEvent[];
  greetingName: string;
  greeting: string; // "morning" | "afternoon" | "evening" — computed server-side to avoid a hydration mismatch
  metrics: DashboardMetrics;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('soonest');
  const [filter, setFilter] = useState<Lifecycle | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const f of FILTERS) if (f.key !== 'all') c[f.key] = 0;
    for (const e of events) c[e.lifecycle] = (c[e.lifecycle] ?? 0) + 1;
    return c;
  }, [events]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((e) => (filter === 'all' ? true : e.lifecycle === filter));
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.venueName ?? '').toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'soonest') sorted.sort((a, b) => a.startMs - b.startMs);
    else if (sort === 'recent') sorted.sort((a, b) => b.startMs - a.startMs);
    else sorted.sort((a, b) => b.registered - a.registered);
    return sorted;
  }, [events, query, filter, sort]);

  const liveToday = events.filter((e) => e.lifecycle === 'live').length;
  const registeringN = events.filter((e) => e.lifecycle === 'registering').length;
  const draftN = counts.drafted ?? 0;
  const summary = [
    liveToday ? `${liveToday} live today` : null,
    registeringN ? `${registeringN} registering` : null,
    draftN ? `${draftN} draft${draftN > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ') || 'No open events';

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function exportCsv() {
    const rows = events.filter((e) => selected.has(e.id));
    const header = ['Title', 'Status', 'Date', 'Venue', 'Registered', 'Capacity', 'Attended'];
    const body = rows.map((e) =>
      [e.title, PILL[e.lifecycle].label, e.dateLabel, e.venueName ?? '', String(e.registered), e.maxAttendees == null ? '' : String(e.maxAttendees), String(e.attended)]
        .map(csvEscape).join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eventar-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-md mb-lg">
        <div>
          <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">Dashboard</p>
          <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.03em] text-on-surface">
            Good {greeting}, {greetingName || 'there'}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">{summary}</p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center gap-sm bg-tertiary text-on-tertiary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>
          New event
        </Link>
      </header>

      {/* Metric strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm mb-lg">
        <Metric label="People registered (open events)" value={metrics.openRegistered} tone="accent" />
        <Metric label="Registered in last 7 days" value={metrics.registered7d} prefix="+" tone="success" />
        <Metric label="Events happening this week" value={metrics.eventsThisWeek} tone="plain" />
        <Metric label="Registration closing in 7 days" value={metrics.closingSoon} tone="plain" />
      </div>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-sm mb-md">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-[18px] absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" aria-hidden>search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm pl-[42px] pr-md font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-[color:var(--on-primary-container)] transition-colors"
          />
        </div>
        <label className="inline-flex items-center gap-sm bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm shrink-0">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>swap_vert</span>
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort events"
            className="bg-transparent font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer"
          >
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-lg overflow-x-auto border-b border-outline-variant mb-lg -mx-grid-margin px-grid-margin">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const n = counts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`relative shrink-0 pb-md pt-xs font-label-md text-label-md transition-colors ${active ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {f.label}
              <span className={`ml-xs inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold ${active ? 'bg-[color:var(--on-primary-container)] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>{n}</span>
              {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[color:var(--on-primary-container)] rounded-full" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-md bg-primary-container/60 border border-[color:var(--primary-fixed-dim)] rounded-lg px-md py-sm mb-md">
          <span className="font-label-md text-label-md text-on-surface font-semibold">{selected.size} selected</span>
          <div className="flex items-center gap-xs">
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-xs px-md py-sm rounded-lg bg-surface-container-lowest border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>download</span>Export CSV
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="px-md py-sm rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">Clear</button>
          </div>
        </div>
      )}

      {/* Event cards */}
      {visible.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {events.length === 0 ? 'No events yet.' : 'No events match this filter.'}
          </p>
          {events.length === 0 && (
            <Link href="/events/new" className="inline-flex items-center gap-sm mt-md bg-tertiary text-on-tertiary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>Create your first event
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {visible.map((e) => <EventCard key={e.id} e={e} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} />)}
        </ul>
      )}
    </>
  );
}

function Metric({ label, value, prefix, tone }: { label: string; value: number; prefix?: string; tone: 'accent' | 'success' | 'plain' }) {
  const color = tone === 'accent' ? 'text-[color:var(--on-primary-container)]' : tone === 'success' ? 'text-[color:var(--success)]' : 'text-on-surface';
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[14px] p-md">
      <p className="font-label-md text-label-md text-on-surface-variant leading-snug mb-sm normal-case tracking-normal">{label}</p>
      <p className={`text-[30px] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${color}`}>{prefix}{value}</p>
    </div>
  );
}

function EventCard({ e, selected, onToggle }: { e: WorkstationEvent; selected: boolean; onToggle: () => void }) {
  const pill = PILL[e.lifecycle];
  const cap = e.maxAttendees;
  const pct = cap && cap > 0 ? Math.min(100, Math.round((e.registered / cap) * 100)) : null;
  const showAttended = e.lifecycle === 'live' || e.lifecycle === 'completed';
  const stripe =
    e.lifecycle === 'live' || e.lifecycle === 'registering' ? 'bg-[color:var(--success)]'
    : e.lifecycle === 'drafted' ? 'bg-[color:var(--warning)]'
    : e.lifecycle === 'cancelled' ? 'bg-[color:var(--error)]'
    : e.lifecycle === 'upcoming' ? 'bg-[color:var(--on-primary-container)]'
    : 'bg-outline-variant';

  return (
    <li className="relative flex items-stretch gap-md bg-surface-container-lowest border border-outline-variant rounded-[16px] overflow-hidden">
      <span className={`w-[4px] shrink-0 ${stripe}`} aria-hidden />
      <div className="flex items-start gap-md flex-1 min-w-0 py-md pr-md">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${e.title}`}
          className="mt-1 w-[18px] h-[18px] shrink-0 accent-[color:var(--on-primary-container)] cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap mb-xs">
            <Link href={`/events/${e.id}/details`} className="font-title-lg text-title-lg font-semibold text-on-surface hover:text-[color:var(--on-primary-container)] transition-colors truncate">
              {e.title}
            </Link>
            <span className={`inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[11px] font-semibold uppercase tracking-wide ${pill.cls}`}>
              <span className={`w-[6px] h-[6px] rounded-full ${pill.dot}`} aria-hidden />{pill.label}
            </span>
          </div>
          {e.description && <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1 mb-sm">{e.description}</p>}
          <div className="flex items-center gap-md flex-wrap font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
            <span className="inline-flex items-center gap-xs"><span className="material-symbols-outlined text-[16px]" aria-hidden>calendar_today</span>{e.dateLabel}</span>
            <span className="inline-flex items-center gap-xs"><span className="material-symbols-outlined text-[16px]" aria-hidden>schedule</span>{e.timeLabel}</span>
            {e.venueName && <span className="inline-flex items-center gap-xs min-w-0"><span className="material-symbols-outlined text-[16px]" aria-hidden>location_on</span><span className="truncate">{e.venueName}</span></span>}
          </div>
        </div>
      </div>

      {/* Right rail: registered hero + progress + action */}
      <div className="flex items-center gap-md py-md pr-md pl-0 shrink-0">
        <div className="text-right min-w-[140px]">
          <p className="leading-none">
            <span className="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums text-[color:var(--on-primary-container)]">{e.registered}</span>
            {cap != null && <span className="text-body-md text-on-surface-variant"> / {cap}</span>}
          </p>
          {pct != null && (
            <span className="block mt-xs h-[4px] w-full rounded-full bg-surface-container-high overflow-hidden" aria-hidden>
              <span className="block h-full rounded-full bg-[color:var(--success)]" style={{ width: `${pct}%` }} />
            </span>
          )}
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs normal-case tracking-normal">registered</p>
          {showAttended ? (
            <p className="font-label-md text-label-md text-[color:var(--success)] mt-[2px] font-semibold normal-case tracking-normal">{e.attended} checked in</p>
          ) : e.delta7 > 0 ? (
            <p className="font-label-md text-label-md text-[color:var(--success)] mt-[2px] font-semibold normal-case tracking-normal">+{e.delta7} / wk</p>
          ) : e.closesInDays != null ? (
            <p className="font-label-md text-label-md text-on-surface-variant mt-[2px] normal-case tracking-normal">closes in {e.closesInDays}d</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-xs">
          <Link href={`/events/${e.id}/edit`} className="inline-flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>edit</span>Edit
          </Link>
          <Link href={`/events/${e.id}/details`} className="inline-flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>Manage
          </Link>
        </div>
      </div>
    </li>
  );
}
