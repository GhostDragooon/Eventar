'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { softDeleteEvents, restoreEvents, cancelEvents } from '@/app/dashboard/actions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  closesInDays: number | null;
  category: string | null;
  deleted: boolean;
};

export type DashboardMetrics = {
  openRegistered: number;
  registered7d: number;
  eventsThisWeek: number;
  closingSoon: number;
  checkedInToday: number;
  /** Percent, or null when nobody has registered for a run-able event yet. */
  captureRate: number | null;
  creditsIssued: number;
  creditsBlocked: number;
  liveNow: number;
};

// Instructional color (locked): green=live/go, blue=action, amber=draft/hold,
// red=stopped, neutral=context. One pill treatment per lifecycle.
const PILL: Record<Lifecycle, { label: string; cls: string; dot: string }> = {
  live:        { label: 'Live',        cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  registering: { label: 'Registering', cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  upcoming:    { label: 'Upcoming',    cls: 'bg-primary-container text-on-primary-container',  dot: 'bg-[color:var(--on-primary-container)]' },
  drafted:     { label: 'Draft',       cls: 'bg-warning-container text-[color:var(--on-surface)]', dot: 'bg-[color:var(--warning)]' },
  completed:   { label: 'Completed',   cls: 'bg-surface-container-high text-on-surface-variant', dot: 'bg-outline' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-error-container text-[color:var(--error)]', dot: 'bg-[color:var(--error)]' },
};

const CATEGORY_LABEL: Record<string, string> = {
  life_sciences: 'Life sciences',
  engineering: 'Engineering',
  finance: 'Finance',
  technology: 'Technology',
};

type FilterKey = Lifecycle | 'all' | 'deleted';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafted', label: 'Draft' },
  { key: 'registering', label: 'Registering' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'live', label: 'Live' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'deleted', label: 'Deleted' },
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
  greeting: string;
  metrics: DashboardMetrics;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('soonest');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  // Designed confirmation (no window.confirm): what's about to run + on whom.
  const [confirm, setConfirm] = useState<null | {
    kind: 'archive' | 'cancel';
    ids: string[];
    title: string;
    body: string;
    confirmLabel: string;
    tone: 'primary' | 'danger';
  }>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, deleted: 0 };
    for (const f of FILTERS) if (f.key !== 'all' && f.key !== 'deleted') c[f.key] = 0;
    for (const e of events) {
      if (e.deleted) { c.deleted += 1; continue; }
      c.all += 1;
      c[e.lifecycle] = (c[e.lifecycle] ?? 0) + 1;
    }
    return c;
  }, [events]);

  const inBin = filter === 'deleted';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((e) =>
      filter === 'all' ? !e.deleted
      : filter === 'deleted' ? e.deleted
      : !e.deleted && e.lifecycle === filter,
    );
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.venueName ?? '').toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'soonest') sorted.sort((a, b) => a.startMs - b.startMs);
    else if (sort === 'recent') sorted.sort((a, b) => b.startMs - a.startMs);
    else sorted.sort((a, b) => b.registered - a.registered);
    // Live events always surface first (operator priority), stable within.
    if (filter === 'all') {
      const live = sorted.filter((e) => e.lifecycle === 'live');
      const rest = sorted.filter((e) => e.lifecycle !== 'live');
      return [...live, ...rest];
    }
    return sorted;
  }, [events, query, filter, sort]);

  const live = counts.live ?? 0;
  const registeringN = counts.registering ?? 0;
  const draftN = counts.drafted ?? 0;
  const summary = [
    live ? `${live} live today` : null,
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

  function execute(kind: 'archive' | 'cancel' | 'restore', ids: string[]) {
    startTransition(async () => {
      const res =
        kind === 'archive' ? await softDeleteEvents(ids)
        : kind === 'cancel' ? await cancelEvents(ids)
        : await restoreEvents(ids);
      setConfirm(null);
      if ('error' in res) {
        toast('error', res.error);
        return;
      }
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      const n = res.count;
      toast(
        'success',
        kind === 'archive'
          ? `${n} event${n === 1 ? '' : 's'} moved to Deleted — restore any time.`
          : kind === 'cancel'
            ? `${n} event${n === 1 ? '' : 's'} cancelled.`
            : `${n} event${n === 1 ? '' : 's'} restored.`,
      );
    });
  }

  function runBulk(kind: 'archive' | 'cancel' | 'restore') {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (kind === 'restore') {
      execute('restore', ids);
      return;
    }
    const n = ids.length;
    setConfirm(
      kind === 'archive'
        ? {
            kind, ids, tone: 'danger', confirmLabel: `Delete ${n} event${n === 1 ? '' : 's'}`,
            title: `Delete ${n} event${n === 1 ? '' : 's'}?`,
            body: 'They move to the Deleted bucket and can be restored at any time.',
          }
        : {
            kind, ids, tone: 'danger', confirmLabel: `Cancel ${n} event${n === 1 ? '' : 's'}`,
            title: `Cancel ${n} event${n === 1 ? '' : 's'}?`,
            body: 'Registrants keep their records, but the events are marked cancelled on every surface.',
          },
    );
  }

  function deleteOne(e: WorkstationEvent) {
    setConfirm({
      kind: 'archive', ids: [e.id], tone: 'danger', confirmLabel: 'Delete event',
      title: `Delete “${e.title}”?`,
      body: 'It moves to the Deleted bucket and can be restored at any time.',
    });
  }

  function exportCsv() {
    const rows = events.filter((e) => selected.has(e.id));
    const header = ['Title', 'Status', 'Category', 'Date', 'Venue', 'Registered', 'Capacity', 'Attended'];
    const body = rows.map((e) =>
      [e.title, PILL[e.lifecycle].label, e.category ? CATEGORY_LABEL[e.category] ?? '' : '', e.dateLabel, e.venueName ?? '', String(e.registered), e.maxAttendees == null ? '' : String(e.maxAttendees), String(e.attended)]
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
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-md mb-lg">
        <div>
          <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs">Dashboard</p>
          <h1 className="text-[calc(34px*var(--text-scale))] leading-[1.1] font-extrabold tracking-[-0.03em] text-on-surface">
            Good {greeting}, {greetingName || 'there'}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">{summary}</p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center gap-sm bg-primary text-on-primary font-label-md text-label-md rounded-full py-sm px-lg hover:opacity-90 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>add</span>
          New event
        </Link>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm mb-lg">
        {/* The IA spec's four: Registered + delta7d · Checked-in today +
            capture % · Credits issued/pending/blocked (THE CPD PULSE) · Events
            this week. The credits cell is the one that makes this a CPD
            dashboard rather than an events dashboard, and it was missing. */}
        <Metric label="Registered (open events)" value={metrics.openRegistered} tone="accent" foot={metrics.registered7d > 0 ? `+${metrics.registered7d} in 7 days` : 'no change in 7 days'} />
        <Metric label="Checked in today" value={metrics.checkedInToday} tone="success" foot={metrics.captureRate != null ? `${metrics.captureRate}% capture rate` : 'no attendance yet'} />
        <Metric label="Credits issued" value={metrics.creditsIssued} tone="plain" foot={metrics.creditsBlocked > 0 ? `${metrics.creditsBlocked} blocked by lapsed licence` : 'none blocked'} footTone={metrics.creditsBlocked > 0 ? 'warn' : 'muted'} />
        <Metric label="Events this week" value={metrics.eventsThisWeek} tone="plain" foot={metrics.liveNow > 0 ? `${metrics.liveNow} live now` : `${metrics.closingSoon} closing in 7 days`} footTone={metrics.liveNow > 0 ? 'live' : 'muted'} />
      </div>

      <div className="flex flex-col sm:flex-row gap-sm mb-md">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" aria-hidden>search</span>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events" aria-label="Search events"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm pl-[42px] pr-md font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-[color:var(--on-primary-container)] transition-colors"
          />
        </div>
        <label className="inline-flex items-center gap-sm bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm shrink-0">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>swap_vert</span>
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort events" className="bg-transparent font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-lg overflow-x-auto border-b border-outline-variant mb-lg -mx-grid-margin px-grid-margin">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const n = counts[f.key] ?? 0;
          if (f.key === 'deleted' && n === 0) return null;
          return (
            <button key={f.key} type="button" onClick={() => { setFilter(f.key); setSelected(new Set()); }}
              className={`relative shrink-0 pb-md pt-xs font-label-md text-label-md transition-colors ${active ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {f.label}
              <span className={`ml-xs inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[calc(11px*var(--text-scale))] font-semibold ${active ? 'bg-[color:var(--on-primary-container)] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>{n}</span>
              {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[color:var(--on-primary-container)] rounded-full" aria-hidden />}
            </button>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-md bg-primary-container/60 border border-[color:var(--primary-fixed-dim)] rounded-lg px-md py-sm mb-md flex-wrap">
          <span className="font-label-md text-label-md text-on-surface font-semibold">{selected.size} selected</span>
          <div className="flex items-center gap-xs flex-wrap">
            <Button type="button" variant="outline" onClick={exportCsv} disabled={pending} className="gap-xs px-md py-sm font-label-md text-label-md">
              <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>download</span>Export CSV
            </Button>
            {inBin ? (
              <Button type="button" variant="outline" onClick={() => runBulk('restore')} disabled={pending} className="gap-xs px-md py-sm font-label-md text-label-md">
                <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>restore_from_trash</span>Restore
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => runBulk('archive')} disabled={pending} className="gap-xs px-md py-sm font-label-md text-label-md">
                  <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>archive</span>Archive
                </Button>
                <Button type="button" variant="destructive" onClick={() => runBulk('cancel')} disabled={pending} className="gap-xs px-md py-sm font-label-md text-label-md">
                  <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>block</span>Cancel
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending} className="px-md py-sm font-label-md text-label-md text-on-surface-variant hover:text-on-surface">Clear</Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {events.length === 0 ? 'No events yet.' : inBin ? 'The Deleted bucket is empty.' : 'No events match this filter.'}
          </p>
          {events.length === 0 && (
            <Link href="/events/new" className="inline-flex items-center gap-sm mt-md bg-primary text-on-primary font-label-md text-label-md rounded-full py-sm px-lg hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>add</span>Create your first event
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {visible.map((e) => <EventCard key={e.id} e={e} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} onDelete={() => deleteOne(e)} inBin={inBin} onRestore={() => execute('restore', [e.id])} pending={pending} />)}
        </ul>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        confirmLabel={confirm?.confirmLabel ?? ''}
        tone={confirm?.tone ?? 'primary'}
        pending={pending}
        onConfirm={() => confirm && execute(confirm.kind, confirm.ids)}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

// `foot` carries the spec's "deltas always carry comparison context" rule:
// a bare number tells the operator nothing about direction or health.
function Metric({
  label, value, prefix, tone, foot, footTone = 'muted',
}: {
  label: string; value: number; prefix?: string;
  tone: 'accent' | 'success' | 'plain';
  foot?: string; footTone?: 'muted' | 'warn' | 'live';
}) {
  const color = tone === 'accent' ? 'text-[color:var(--on-primary-container)]' : tone === 'success' ? 'text-[color:var(--success)]' : 'text-on-surface';
  const footCls =
    footTone === 'warn' ? 'bg-warning-container text-on-surface'
    : footTone === 'live' ? 'bg-success-container text-on-success-container'
    : 'text-on-surface-variant';
  return (
    <div className="bg-[color:var(--surface-container-high)] rounded-[14px] p-md">
      <p className="font-label-md text-label-md text-on-surface-variant leading-snug mb-sm normal-case tracking-normal">{label}</p>
      <p className={`text-[calc(30px*var(--text-scale))] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${color}`}>{prefix}{value}</p>
      {foot && (
        <p className={`mt-sm inline-block rounded-full px-sm py-[2px] text-[calc(11.5px*var(--text-scale))] font-medium ${footCls}`}>
          {foot}
        </p>
      )}
    </div>
  );
}

function EventCard({ e, selected, onToggle, onDelete, onRestore, inBin, pending }: {
  e: WorkstationEvent; selected: boolean; onToggle: () => void; onDelete: () => void; onRestore: () => void; inBin: boolean; pending: boolean;
}) {
  const pill = PILL[e.lifecycle];
  const cap = e.maxAttendees;
  const pct = cap && cap > 0 ? Math.min(100, Math.round((e.registered / cap) * 100)) : null;
  const showAttended = e.lifecycle === 'live' || e.lifecycle === 'completed';
  const isCompleted = e.lifecycle === 'completed';
  const stripe =
    e.lifecycle === 'live' || e.lifecycle === 'registering' ? 'bg-[color:var(--success)]'
    : e.lifecycle === 'drafted' ? 'bg-[color:var(--warning)]'
    : e.lifecycle === 'cancelled' ? 'bg-[color:var(--error)]'
    : e.lifecycle === 'upcoming' ? 'bg-[color:var(--on-primary-container)]'
    : 'bg-outline-variant';

  return (
    <li className={`relative flex flex-col sm:flex-row sm:items-stretch gap-0 sm:gap-md bg-surface-container-lowest border border-outline-variant rounded-[16px] overflow-hidden ${e.deleted ? 'opacity-70' : ''}`}>
      <span className={`hidden sm:block w-[4px] shrink-0 ${e.deleted ? 'bg-outline-variant' : stripe}`} aria-hidden />
      <span className={`sm:hidden h-[4px] w-full shrink-0 ${e.deleted ? 'bg-outline-variant' : stripe}`} aria-hidden />
      <div className="flex items-start gap-md flex-1 min-w-0 p-md sm:py-md sm:pr-md sm:pl-0">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${e.title}`} className="mt-1 w-[18px] h-[18px] shrink-0 accent-[color:var(--on-primary-container)] cursor-pointer" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap mb-xs">
            <Link href={`/events/${e.id}/details`} className="font-title-lg text-title-lg font-semibold text-on-surface hover:text-[color:var(--on-primary-container)] transition-colors truncate">{e.title}</Link>
            <span className={`inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide ${pill.cls}`}>
              <span className={`w-[6px] h-[6px] rounded-full ${pill.dot}`} aria-hidden />{pill.label}
            </span>
            {e.category && CATEGORY_LABEL[e.category] && (
              <span className="inline-flex items-center px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-medium bg-surface-container-high text-on-surface-variant">{CATEGORY_LABEL[e.category]}</span>
            )}
          </div>
          {e.description && <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1 mb-sm">{e.description}</p>}
          <div className="flex items-center gap-md flex-wrap font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
            <span className="inline-flex items-center gap-xs"><span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>calendar_today</span>{e.dateLabel}</span>
            <span className="inline-flex items-center gap-xs"><span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>schedule</span>{e.timeLabel}</span>
            {e.venueName && <span className="inline-flex items-center gap-xs min-w-0"><span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>location_on</span><span className="truncate">{e.venueName}</span></span>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-md px-md pb-md sm:py-md sm:pr-md sm:pl-0 shrink-0">
        <div className="text-right min-w-[140px]">
          <p className="leading-none">
            <span className="text-[calc(26px*var(--text-scale))] font-extrabold tracking-[-0.02em] tabular-nums text-[color:var(--on-primary-container)]">{e.registered}</span>
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
        {/* Fixed-width action column — every button the same size. */}
        <div className="flex flex-col gap-xs w-[116px] shrink-0">
          {inBin ? (
            <Button type="button" variant="outline" onClick={onRestore} disabled={pending} className="w-full gap-xs px-sm py-sm font-label-md text-label-md">
              <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>restore_from_trash</span>Restore
            </Button>
          ) : (
            <>
              {/* buttonVariants, not <Button render={<Link/>}> — base-ui stamps
                  role="button" on a Link rendered through Button's render prop,
                  which announces a navigation as a button to assistive tech. */}
              <Link
                href={isCompleted ? `/events/${e.id}/analytics` : `/events/${e.id}/edit`}
                className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-xs px-sm py-sm font-label-md text-label-md')}
              >
                <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>{isCompleted ? 'insights' : 'edit'}</span>{isCompleted ? 'Analytics' : 'Edit'}
              </Link>
              <Button type="button" variant="destructive" onClick={onDelete} disabled={pending} className="w-full gap-xs px-sm py-sm font-label-md text-label-md">
                <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>delete</span>Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
