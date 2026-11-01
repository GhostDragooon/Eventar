'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { softDeleteEvents, restoreEvents, cancelEvents } from '@/app/dashboard/actions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import type { ProgrammeEvent } from './programmeEvent';
import type { TabKey } from './eventTabs';

const PILL: Record<Lifecycle, { label: string }> = {
  live:        { label: 'Live' },
  registering: { label: 'Registering' },
  upcoming:    { label: 'Upcoming' },
  drafted:     { label: 'Draft' },
  completed:   { label: 'Completed' },
  cancelled:   { label: 'Cancelled' },
};

const CATEGORY_LABEL: Record<string, string> = {
  medicine_dentistry: 'Medicine & dentistry',
  allied_health: 'Allied health',
  other: 'Other',
};

// The Events home shows four states (Ivan, CX-04R pick a, 2026-10-31). Completed events are History's, not this
// page's, so they belong to no tab. Deleted is hidden while it is empty.
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'deleted', label: 'Deleted' },
];

function bucket(e: ProgrammeEvent): TabKey | null {
  if (e.deleted) return 'deleted';
  if (e.lifecycle === 'drafted') return 'drafts';
  if (e.lifecycle === 'cancelled') return 'cancelled';
  if (e.lifecycle === 'completed') return null;
  return 'active';
}

type SortKey = 'soonest' | 'recent' | 'most';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'recent', label: 'Most recent' },
  { key: 'most', label: 'Most registered' },
];
// Select.Value resolves its displayed label from this `items` map, NOT from
// the SelectItem children rendered in the popup — without it, the trigger
// shows the raw value ("most") instead of the label ("Most registered").
const SORT_ITEMS: Record<SortKey, string> = Object.fromEntries(SORTS.map((s) => [s.key, s.label])) as Record<SortKey, string>;

// fetchDecoratedEvents reads the newest 300 events; a list that long may have older ones behind it.
const FETCH_CAP = 300;

// A leading = + - @ makes Excel run the cell as a formula; an apostrophe keeps it text.
function csvEscape(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type EventsHomeProps = {
  events: ProgrammeEvent[];
  /** Server time: a draft whose date has passed says so, and a date in another year shows its year. */
  nowMs: number;
  /** The tab a link asked for (?tab=). Read once on load; clicking a tab then keeps the address in step. */
  initialTab?: TabKey;
};

const UNDO_SECONDS = 7;

export function EventsHome({ events, nowMs, initialTab = 'active' }: EventsHomeProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('soonest');
  const [chosenTab, setChosenTab] = useState<TabKey>(initialTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | {
    kind: 'archive' | 'cancel';
    ids: string[];
    title: string;
    body: string;
    confirmLabel: string;
    tone: 'primary' | 'danger';
  }>(null);
  // Cancel is one-way in the database, so its undo delays the write instead:
  // nothing is sent until the countdown ends or the organiser clicks Done.
  // left === 0 means the write has been sent.
  const [undo, setUndo] = useState<null | { ids: string[]; left: number }>(null);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { active: 0, drafts: 0, cancelled: 0, deleted: 0 };
    for (const e of events) {
      const k = bucket(e);
      if (k) c[k] += 1;
    }
    return c;
  }, [events]);

  // Deleted hides while it is empty: restoring the last deleted event must not leave the page on a tab that is gone.
  const tab: TabKey = chosenTab === 'deleted' && counts.deleted === 0 ? 'active' : chosenTab;
  const inBin = tab === 'deleted';
  const total = counts.active + counts.drafts + counts.cancelled;

  function pickTab(next: TabKey) {
    setChosenTab(next);
    setSelected(new Set());
    // The address follows the tab so a refresh or a shared link keeps it. Next.js reads history.replaceState, so this
    // costs no server round trip. Active is the default and carries no parameter.
    const url = new URL(window.location.href);
    if (next === 'active') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((e) => bucket(e) === tab);
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.venueName ?? '').toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'soonest') sorted.sort((a, b) => a.startMs - b.startMs);
    else if (sort === 'recent') sorted.sort((a, b) => b.startMs - a.startMs);
    else sorted.sort((a, b) => b.registered - a.registered);
    if (tab === 'active') {
      const live = sorted.filter((e) => e.lifecycle === 'live');
      const rest = sorted.filter((e) => e.lifecycle !== 'live');
      return [...live, ...rest];
    }
    return sorted;
  }, [events, query, tab, sort]);

  // Only ticked rows that are on screen count: a search that hides a ticked row must not leave it in the bulk action.
  const picked = useMemo(() => {
    const on = new Set(visible.map((e) => e.id));
    return new Set([...selected].filter((id) => on.has(id)));
  }, [selected, visible]);

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
      setUndo(null);
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

  const counting = undo != null && undo.left > 0;
  // While counting, every other bulk/card action is locked: a second action
  // would close this dialog (execute clears undo) and drop the cancel.
  const busy = pending || counting;

  // Set synchronously at send time: a tick and a visibility change can both
  // fire before React re-renders, so rendered `undo.left` is too late a marker.
  const sent = useRef(false);
  // Done sits where the first dialog's confirm button was: a double-click
  // there must not skip the undo window.
  const openedAt = useRef(0);

  function commitCancel() {
    if (!undo || sent.current) return;
    sent.current = true;
    setUndo({ ...undo, left: 0 });
    execute('cancel', undo.ids);
  }

  function undoCancel() {
    if (!counting || sent.current) return;
    setUndo(null);
    toast('neutral', 'Undone. Nothing was cancelled.');
  }

  const onTick = useEffectEvent(() => {
    if (sent.current) return;
    if (undo && undo.left > 1) setUndo({ ...undo, left: undo.left - 1 });
    else commitCancel();
  });
  useEffect(() => {
    if (!undo || undo.left === 0) return;
    const t = setTimeout(onTick, 1000);
    return () => clearTimeout(t);
  }, [undo]);

  // While counting down: a hidden page (phone locked, tab switched, iOS where
  // beforeunload never prompts) sends at once rather than risk a paused timer;
  // closing the tab gets the browser's leave-page warning.
  const onHidden = useEffectEvent(() => {
    if (document.hidden) commitCancel();
  });
  useEffect(() => {
    if (!counting) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const hidden = () => onHidden();
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [counting]);

  // Leaving the page through in-app navigation mid-countdown sends the cancel
  // (the toast provider sits in the root layout, so a failure still shows).
  const sendIfUnsent = useEffectEvent(() => {
    if (!undo || sent.current) return;
    sent.current = true;
    void cancelEvents(undo.ids).then(
      (r) => {
        if ('error' in r) toast('error', r.error);
        else toast('success', `${r.count} event${r.count === 1 ? '' : 's'} cancelled.`);
      },
      () => toast('error', 'Could not cancel the selected events.'),
    );
  });
  useEffect(() => () => sendIfUnsent(), []);

  function runBulk(kind: 'archive' | 'cancel' | 'restore') {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (kind === 'restore') {
      execute('restore', ids);
      return;
    }
    const n = ids.length;
    const titleOf = (id: string) => events.find((e) => e.id === id)?.title ?? 'this event';
    setConfirm(
      kind === 'archive'
        ? {
            kind, ids, tone: 'danger', confirmLabel: `Delete ${n} event${n === 1 ? '' : 's'}`,
            title: n === 1 ? `Delete "${titleOf(ids[0])}"?` : `Delete ${n} events?`,
            body: 'They move to the Deleted bucket and can be restored at any time.',
          }
        : {
            kind, ids, tone: 'danger', confirmLabel: `Cancel ${n} event${n === 1 ? '' : 's'}`,
            title: n === 1 ? `Cancel "${titleOf(ids[0])}"?` : `Cancel ${n} events?`,
            body: 'Registrants keep their records and nobody is emailed. The events move to the Cancelled tab.',
          },
    );
  }

  function exportCsv() {
    const rows = events.filter((e) => picked.has(e.id));
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

  const btn = 'min-h-11 gap-xs px-md font-label-md text-label-md';
  const icon16 = 'text-[calc(16px*var(--text-scale))]';

  return (
    <>
      <header className="mb-md flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-[calc(28px*var(--text-scale))] font-bold tracking-[-0.02em] text-on-surface">Events</h1>
          <p className="text-[calc(13px*var(--text-scale))] text-on-surface-variant">
            {total} event{total === 1 ? '' : 's'}. Finished events are in <Link href="/analytics" className="underline underline-offset-2 hover:text-on-surface">History</Link>.
          </p>
        </div>
        <Link href="/events/new" className={cn(buttonVariants(), 'h-11 gap-xs px-lg font-label-md text-label-md')}>
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>add</span>New event
        </Link>
      </header>

      <div role="group" aria-label="Filter events by state" className="-mx-grid-margin mb-md flex items-center gap-lg overflow-x-auto border-b border-outline-variant px-grid-margin">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = counts[t.key];
          if (t.key === 'deleted' && n === 0) return null;
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => pickTab(t.key)}
              className={cn('relative flex min-h-11 shrink-0 items-center font-label-md text-label-md', on ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface')}>
              {t.label}
              <span className="sr-only">, </span>
              {/* bg-primary + text-on-primary, not the shipped text-white on --on-primary-container (1.32:1 in dark). */}
              <span className={cn('ml-xs inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[calc(11px*var(--text-scale))] font-semibold', on ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>{n}</span>
              {on && <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-[color:var(--on-primary-container)]" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mb-md flex flex-col gap-sm sm:flex-row">
        <div className="relative flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-md top-1/2 -translate-y-1/2 text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>search</span>
          <Input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events" aria-label="Search events"
            className="h-11 w-full py-sm pl-[42px] pr-md text-body-md"
          />
        </div>
        <div className="inline-flex min-h-11 shrink-0 items-center gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest px-md">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>swap_vert</span>
          <span className="font-label-md text-label-md uppercase text-on-surface-variant">Sort</span>
          <Select
            items={SORT_ITEMS}
            value={sort}
            onValueChange={(value) => value && setSort(value as SortKey)}
          >
            <SelectTrigger aria-label="Sort events" className="border-none bg-transparent p-0 font-label-md text-label-md text-on-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {picked.size > 0 && (
        <div className="bulk-bar-in mb-md flex flex-wrap items-center justify-between gap-md rounded-lg border border-[color:var(--primary-fixed-dim)] bg-primary-container/60 px-md py-sm">
          <span className="font-label-md text-label-md font-semibold text-on-surface">{picked.size} selected</span>
          <div className="flex flex-wrap items-center gap-sm">
            <Button type="button" variant="outline" onClick={exportCsv} disabled={pending} className={btn}>
              <span className={cn('material-symbols-outlined', icon16)} aria-hidden>download</span>Export CSV
            </Button>
            {inBin ? (
              <Button type="button" variant="outline" onClick={() => runBulk('restore')} disabled={busy} className={btn}>
                <span className={cn('material-symbols-outlined', icon16)} aria-hidden>restore_from_trash</span>Restore
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => runBulk('archive')} disabled={busy} className={btn}>
                  <span className={cn('material-symbols-outlined', icon16)} aria-hidden>delete</span>Delete
                </Button>
                {tab === 'active' && (
                  <Button type="button" variant="destructive" onClick={() => runBulk('cancel')} disabled={busy} className={btn}>
                    <span className={cn('material-symbols-outlined', icon16)} aria-hidden>block</span>Cancel
                  </Button>
                )}
              </>
            )}
            <Button type="button" variant="ghost" onClick={() => setSelected(new Set())} disabled={busy} className={cn(btn, 'text-on-surface-variant hover:text-on-surface')}>Clear</Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {events.length === 0
              ? 'No events yet.'
              : query.trim()
                ? `Nothing in ${TABS.find((t) => t.key === tab)?.label ?? 'this tab'} matches this search.`
                : inBin
                  ? 'The Deleted bucket is empty.'
                  : tab === 'drafts'
                    ? 'No drafts.'
                    : tab === 'cancelled'
                      ? 'No cancelled events.'
                      : 'No active events. Finished events are in History.'}
          </p>
          {events.length === 0 && (
            <Link href="/events/new" className={cn(buttonVariants(), 'mt-md h-11 gap-sm px-lg font-label-md text-label-md')}>
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>add</span>Create your first event
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {visible.map((e) => (
            <EventRow key={e.id} e={e} nowMs={nowMs} selected={picked.has(e.id)} onToggle={() => toggle(e.id)} inBin={inBin} onRestore={() => execute('restore', [e.id])} pending={busy} />
          ))}
        </ul>
      )}

      {events.length >= FETCH_CAP && (
        <p className="mt-lg text-[calc(13px*var(--text-scale))] text-on-surface-variant">
          Showing the {FETCH_CAP} events with the latest dates. Finished events are in History.
        </p>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        confirmLabel={confirm?.confirmLabel ?? ''}
        cancelLabel={confirm?.kind === 'cancel' ? 'Keep events' : undefined}
        tone={confirm?.tone ?? 'primary'}
        pending={pending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind !== 'cancel') return execute(confirm.kind, confirm.ids);
          setConfirm(null);
          sent.current = false;
          openedAt.current = Date.now();
          setUndo({ ids: confirm.ids, left: UNDO_SECONDS });
        }}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={undo != null}
        title="Moved to the Cancelled tab"
        body={`Registrants keep their records. You have ${UNDO_SECONDS} seconds to undo.`}
        confirmLabel="Done"
        cancelLabel={undo?.left ? `Undo (${undo.left})` : 'Undo'}
        backdropCancels={false}
        pending={pending}
        onConfirm={() => { if (Date.now() - openedAt.current >= 500) commitCancel(); }}
        onCancel={undoCancel}
      />
    </>
  );
}

// CX-04R pick 1f: the tick box sits outside the card, in a gutter as tall as the card, so it shares a centreline with the
// date block. Inside the card the status pill and title are one 44 px line; the details and the buttons start at the pill's
// left edge. Motion 2a: nothing animates here.
function EventRow({ e, nowMs, selected, onToggle, onRestore, inBin, pending }: {
  e: ProgrammeEvent; nowMs: number; selected: boolean; onToggle: () => void; onRestore: () => void; inBin: boolean; pending: boolean;
}) {
  const day = Number(e.dayKey.slice(8));
  // dateLabel is "Mon 2 Nov" (en-GB, in the event's own timezone); dayKey is the same day as YYYY-MM-DD.
  const [weekday, , month] = e.dateLabel.split(/[ ,]+/);
  // ponytail: this year is read in UTC, so an event within hours of New Year can show or hide its year wrongly; a tz-aware year needs the event's timezone on ProgrammeEvent.
  const year = e.dayKey.slice(0, 4);
  const otherYear = year !== String(new Date(nowMs).getUTCFullYear());
  const showAttended = e.lifecycle === 'live' || e.lifecycle === 'completed';
  // The filled button is the next thing an organiser does: check people in while the event is live or open.
  const doorNow = e.lifecycle === 'live' || e.lifecycle === 'registering';
  const passed = e.lifecycle === 'drafted' && !e.deleted && e.startMs < nowMs;
  const link = cn('min-h-11 w-full gap-xs px-sm font-label-md text-label-md');

  return (
    <li className={cn('grid grid-cols-[44px_minmax(0,1fr)] gap-sm', e.deleted && 'opacity-70')}>
      <div className="flex items-center">
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${e.title}`} className="size-[18px] cursor-pointer accent-[color:var(--on-primary-container)]" />
        </label>
      </div>
      <div className={cn('grid grid-cols-[56px_minmax(0,1fr)] gap-xs rounded-[16px] border bg-surface-container-lowest p-xs', selected ? 'border-[color:var(--primary-fixed-dim)]' : 'border-outline-variant')}>
        <div className="flex flex-col items-center justify-center rounded-[12px] bg-surface-container text-center">
          <span className="text-[calc(22px*var(--text-scale))] font-bold leading-none tabular-nums text-on-surface">{day}</span>
          <span className="mt-xs text-[calc(12px*var(--text-scale))] leading-none text-on-surface-variant">{weekday} {month}</span>
          {otherYear && <span className="mt-[2px] text-[calc(11px*var(--text-scale))] leading-none tabular-nums text-on-surface-variant">{year}</span>}
        </div>
        <div className="flex min-w-0 flex-col rounded-[12px] bg-surface-container p-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-x-sm">
            <span className="flex h-11 items-center"><StatusPill lifecycle={e.lifecycle} /></span>
            <Link href={`/events/${e.id}/details`} className="font-title-lg text-title-lg font-semibold text-on-surface transition-colors hover:text-[color:var(--on-primary-container)]">{e.title}</Link>
          </div>
          <div className="-mt-xs pb-xs">
            <div className="mt-xs flex flex-wrap items-center gap-x-md gap-y-xs text-[calc(12.5px*var(--text-scale))] text-on-surface-variant">
              <span className="inline-flex items-center gap-xs tabular-nums"><span className="material-symbols-outlined text-[calc(14px*var(--text-scale))]" aria-hidden>schedule</span>{e.timeLabel}</span>
              {e.venueName && <span className="inline-flex min-w-0 items-center gap-xs"><span className="material-symbols-outlined text-[calc(14px*var(--text-scale))]" aria-hidden>location_on</span><span className="truncate">{e.venueName}</span></span>}
              {e.category && CATEGORY_LABEL[e.category] && <span>{CATEGORY_LABEL[e.category]}</span>}
              {e.lifecycle !== 'drafted' && (
                <span className="tabular-nums">
                  {e.registered}{e.maxAttendees != null ? ` / ${e.maxAttendees}` : ''} registered{showAttended ? `, ${e.attended} checked in` : ''}
                </span>
              )}
            </div>
            {passed && <p className="mt-xs text-[calc(12.5px*var(--text-scale))] font-medium text-on-surface">The date has passed. Edit the date to publish this draft.</p>}
          </div>
          <div className={cn('mt-xs grid gap-sm', e.lifecycle === 'drafted' || e.lifecycle === 'cancelled' ? 'grid-cols-2' : 'grid-cols-3')}>
            {inBin ? (
              <Button type="button" variant="outline" onClick={onRestore} disabled={pending} className={cn(link, 'col-span-3')}>
                <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>restore_from_trash</span>Restore
              </Button>
            ) : (
              <>
                <Link href={`/events/${e.id}/details`} className={cn(buttonVariants({ variant: 'outline' }), link)}>Details</Link>
                <Link href={`/events/${e.id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), link)}>Edit</Link>
                {/* Check-in is refused on a draft until it is published, and closed on a cancelled event (checkInGateMessage). */}
                {e.lifecycle !== 'drafted' && e.lifecycle !== 'cancelled' && (
                  <Link href={`/events/${e.id}/checkin`} className={cn(buttonVariants({ variant: doorNow ? 'default' : 'outline' }), link)}>Check-in</Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
