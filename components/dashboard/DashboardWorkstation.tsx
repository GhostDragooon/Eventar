'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState, useSyncExternalStore } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { NeedsAttention, type AttentionItem } from './NeedsAttention';
import { ExpandableEventCard } from '@/components/event-discovery/ExpandableEventCard';
import type { EventCardRecord } from '@/components/event-discovery/EventCard';
import { EVENT_FORMATS, type EventFormat } from '@/app/events/new/schema';

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

/** Programme home's richer event shape — a superset of WorkstationEvent, so
 *  the same rows also drive the Manage page without a second fetch. */
export type ProgrammeEvent = WorkstationEvent & {
  format: EventFormat | null;
  hero_image_url: string | null;
  city: string | null;
  hosts: Array<{ name: string; avatar_url: string | null }>;
};

export type DashboardMetrics = {
  openRegistered: number;
  registered7d: number;
  eventsThisWeek: number;
  closingSoon: number;
  checkedInToday: number;
  captureRate: number | null;
  creditsIssued: number;
  creditsBlocked: number;
  liveNow: number;
};

export type ViewMode = 'card' | 'compact';
export type Segment = 'upcoming' | 'past';

const VIEW_STORAGE_KEY = 'eventar.programme.view';
const TZ = 'Asia/Hong_Kong';

const PILL: Record<Lifecycle, { label: string; cls: string; dot: string }> = {
  live:        { label: 'Live',        cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  registering: { label: 'Registering', cls: 'bg-success-container text-on-success-container', dot: 'bg-[color:var(--success)]' },
  upcoming:    { label: 'Upcoming',    cls: 'bg-primary-container text-on-primary-container',  dot: 'bg-[color:var(--on-primary-container)]' },
  drafted:     { label: 'Draft',       cls: 'bg-warning-container text-[color:var(--on-surface)]', dot: 'bg-[color:var(--warning)]' },
  completed:   { label: 'Completed',   cls: 'bg-surface-container-high text-on-surface-variant', dot: 'bg-outline' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-error-container text-[color:var(--error)]', dot: 'bg-[color:var(--error)]' },
};

const FORMAT_LABEL: Record<EventFormat, string> = {
  conference: 'Conference',
  symposium: 'Symposium',
  seminar: 'Seminar',
  lecture: 'Lecture',
  workshop: 'Workshop',
  webinar: 'Webinar',
  other: 'Other',
};

function readViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'card';
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v === 'card' || v === 'compact' ? v : 'card';
  } catch {
    return 'card';
  }
}
function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function notifyStorage() {
  window.dispatchEvent(new StorageEvent('storage'));
}

function hkDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function hkDateHeader(ms: number): { day: string; dow: string } {
  return {
    day: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(ms)),
    dow: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(new Date(ms)),
  };
}
function hkClock(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}
function hkYearMonth(ms: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms));
  return {
    year: Number(parts.find((p) => p.type === 'year')!.value),
    month: Number(parts.find((p) => p.type === 'month')!.value) - 1,
  };
}
function orgInitials(name: string | null): string {
  if (!name) return 'EV';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export type DashboardWorkstationProps = {
  events: ProgrammeEvent[];
  attention: AttentionItem[];
  metrics: DashboardMetrics;
  orgName: string | null;
  nowMs: number;
};

export function DashboardWorkstation({ events, attention, metrics, orgName, nowMs }: DashboardWorkstationProps) {
  const viewMode = useSyncExternalStore<ViewMode>(subscribeStorage, readViewMode, () => 'card');
  const [agendaSearchOpen, setAgendaSearchOpen] = useState(false);
  const [agendaQuery, setAgendaQuery] = useState('');
  const [activeFormat, setActiveFormat] = useState<EventFormat | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>('upcoming');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => hkYearMonth(nowMs));

  function changeView(v: ViewMode) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // Best-effort persistence only.
    }
    notifyStorage();
  }

  const todayKey = hkDateKey(nowMs);

  const agendaEligible = useMemo(
    () => events.filter((e) => !e.deleted && e.lifecycle !== 'drafted'),
    [events],
  );

  const formatCounts = useMemo(() => {
    const counts = new Map<EventFormat, number>();
    for (const e of agendaEligible) {
      if (!e.format) continue;
      counts.set(e.format, (counts.get(e.format) ?? 0) + 1);
    }
    return counts;
  }, [agendaEligible]);

  const presentFormats = EVENT_FORMATS.filter((f) => (formatCounts.get(f) ?? 0) > 0);
  const visibleChips = presentFormats.slice(0, 6);
  const overflowFormats = presentFormats.slice(6);

  const agendaFiltered = useMemo(() => {
    let list = agendaEligible;
    if (activeFormat) list = list.filter((e) => e.format === activeFormat);
    if (agendaQuery.trim()) {
      const q = agendaQuery.trim().toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.venueName ?? '').toLowerCase().includes(q));
    }
    if (selectedDay) {
      list = list.filter((e) => hkDateKey(e.startMs) === selectedDay);
      return [...list].sort((a, b) => a.startMs - b.startMs);
    }
    list = list.filter((e) =>
      segment === 'upcoming' ? e.lifecycle === 'live' || e.startMs >= nowMs : e.lifecycle !== 'live' && e.startMs < nowMs,
    );
    return [...list].sort((a, b) => (segment === 'upcoming' ? a.startMs - b.startMs : b.startMs - a.startMs));
  }, [agendaEligible, activeFormat, agendaQuery, selectedDay, segment, nowMs]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, ProgrammeEvent[]>();
    for (const e of agendaFiltered) {
      const key = hkDateKey(e.startMs);
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [agendaFiltered]);

  const eventDays = useMemo(() => new Set(agendaEligible.map((e) => hkDateKey(e.startMs))), [agendaEligible]);

  function toRecord(e: ProgrammeEvent): EventCardRecord {
    return {
      id: e.id,
      title: e.title,
      summary: e.description ?? undefined,
      format: e.format ? FORMAT_LABEL[e.format] : undefined,
      dateLabel: `${e.dateLabel} · ${e.timeLabel}`,
      venueLabel: e.venueName ? (e.city ? `${e.venueName}, ${e.city}` : e.venueName) : '',
      imageUrl: e.hero_image_url ?? undefined,
      organizers: e.hosts.map((h) => h.name),
    };
  }

  const zeroEventsOverall = events.length === 0;

  return (
    <>
      {/* 1 · Programme header */}
      <div className="relative mb-lg h-[180px] overflow-hidden rounded-2xl" aria-hidden>
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(120% 140% at 85% -10%, rgba(255,255,255,0.25), transparent 60%), linear-gradient(120deg, var(--primary) 0%, var(--tertiary) 100%)' }}
        />
      </div>
      <div className="-mt-[40px] ml-[20px] mb-md flex h-[80px] w-[80px] items-center justify-center rounded-[18px] bg-surface p-[4px] shadow-md">
        <div
          className="flex h-full w-full items-center justify-center rounded-[14px] text-[26px] font-semibold text-white"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--primary), var(--tertiary))' }}
        >
          {orgInitials(orgName)}
        </div>
      </div>
      <header className="mb-lg">
        <h1 className="text-[calc(34px*var(--text-scale))] font-bold leading-[1.1] tracking-[-0.02em] text-on-surface">
          {orgName ?? 'Your programme'}
        </h1>
        <p className="mt-xs flex items-center gap-xs text-[calc(13px*var(--text-scale))] text-on-surface-variant">
          <span className="material-symbols-outlined text-[calc(15px*var(--text-scale))]" aria-hidden>schedule</span>
          Times in HKT — {hkClock(nowMs)}
        </p>
        <p className="mt-xs text-[calc(14px*var(--text-scale))] text-on-surface-variant">
          Accredited CME / CPD events on Eventar · organiser workspace
        </p>
        <hr className="mt-lg border-t border-outline-variant" />
      </header>

      {/* 2 · Needs attention */}
      {attention.length > 0 && (
        <div className="mb-lg">
          <NeedsAttention items={attention} />
        </div>
      )}

      {/* 3 · Events — agenda + calendar */}
      <section className="mb-xxl">
        <div className="mb-lg flex items-center justify-between gap-md">
          <h2 className="text-[calc(26px*var(--text-scale))] font-bold tracking-[-0.02em] text-on-surface">Events</h2>
          <div className="flex items-center gap-xs">
            <button
              type="button"
              aria-pressed={viewMode === 'card'}
              aria-label="Card view"
              onClick={() => changeView('card')}
              className={`grid h-[32px] w-[32px] place-items-center rounded-lg border ${viewMode === 'card' ? 'border-outline-variant bg-surface' : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>grid_view</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'compact'}
              aria-label="Compact view"
              onClick={() => changeView('compact')}
              className={`grid h-[32px] w-[32px] place-items-center rounded-lg border ${viewMode === 'compact' ? 'border-outline-variant bg-surface' : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>view_list</span>
            </button>
            <button
              type="button"
              aria-pressed={agendaSearchOpen}
              aria-label="Search events"
              onClick={() => {
                setAgendaSearchOpen((v) => {
                  if (v) setAgendaQuery('');
                  return !v;
                });
              }}
              className={`grid h-[32px] w-[32px] place-items-center rounded-lg border ${agendaSearchOpen ? 'border-outline-variant bg-surface' : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>search</span>
            </button>
          </div>
        </div>

        {agendaSearchOpen && (
          <input
            type="text"
            value={agendaQuery}
            onChange={(e) => setAgendaQuery(e.target.value)}
            placeholder="Search your programme"
            aria-label="Search your programme"
            autoFocus
            className="mb-md w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
        )}

        {presentFormats.length > 0 && (
          <div className="mb-lg flex flex-wrap gap-[6px]">
            {visibleChips.map((f) => {
              const active = activeFormat === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveFormat(active ? null : f)}
                  className={`inline-flex items-center gap-[5px] rounded-full border px-[12px] py-[5px] text-[12.5px] font-medium ${
                    active
                      ? 'border-transparent bg-primary-container font-semibold text-on-primary-container'
                      : 'border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {FORMAT_LABEL[f]} · {formatCounts.get(f)}
                </button>
              );
            })}
            {overflowFormats.length > 0 && (
              <span
                title={overflowFormats.map((f) => FORMAT_LABEL[f]).join(', ')}
                className="inline-flex items-center rounded-full border border-outline-variant px-[12px] py-[5px] text-[12.5px] font-medium text-on-surface-variant"
              >
                +{overflowFormats.length}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-[28px] min-[900px]:grid-cols-[1fr_280px]">
          {/* Left — agenda */}
          <div className="min-w-0" data-testid="agenda">
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="mb-md inline-flex items-center gap-xs rounded-full bg-primary-container px-md py-xs text-[12.5px] font-semibold text-on-primary-container"
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden>close</span>
                {hkDateHeader(new Date(`${selectedDay}T00:00:00`).getTime()).day} — clear filter
              </button>
            )}

            {zeroEventsOverall ? (
              <EmptyAgenda
                text="No events yet. Create your first event to build your programme."
                cta
              />
            ) : dateGroups.length === 0 ? (
              <EmptyAgenda
                text={segment === 'upcoming' ? 'No upcoming events. Create one to start your programme.' : 'No past events yet.'}
                cta={segment === 'upcoming'}
              />
            ) : (
              dateGroups.map(([key, dayEvents]) => {
                const { day, dow } = hkDateHeader(dayEvents[0].startMs);
                return (
                  <div key={key} className="mb-md">
                    <div className="sticky top-0 z-[1] flex items-baseline gap-[10px] border-b border-outline-variant bg-sidebar py-[10px]">
                      <span className="text-[15px] font-bold text-on-surface">{day}</span>
                      <span className="text-[15px] text-on-surface-variant">{dow}</span>
                    </div>
                    {dayEvents.map((e) => (
                      <Fragment key={e.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpandedId(e.id); }
                          }}
                          className={`ev-row mx-[-12px] grid cursor-pointer gap-[16px] rounded-[12px] p-[14px_12px] transition-colors duration-[180ms] hover:bg-[rgba(20,23,43,0.035)] focus-visible:outline-2 focus-visible:outline-primary ${
                            viewMode === 'card' ? 'grid-cols-[88px_1fr_110px]' : 'grid-cols-[88px_1fr]'
                          }`}
                        >
                          <div className="pt-[2px] text-[13px] tabular-nums text-on-surface-variant">{e.timeLabel}</div>
                          <div className="min-w-0">
                            <div className="mb-[6px] flex items-start justify-between gap-md">
                              <h3 className="m-0 text-[16px] font-semibold leading-[1.35] tracking-[-0.01em] text-on-surface">{e.title}</h3>
                              <AgendaStatusPill event={e} />
                            </div>
                            {e.hosts.length > 0 && (
                              <div className="mt-xs flex items-center gap-[6px] text-[12.5px] text-on-surface-variant">
                                <AvatarStack hosts={e.hosts} />
                                <span className="truncate">By {e.hosts.map((h) => h.name).join(', ')}</span>
                              </div>
                            )}
                            {e.venueName && (
                              <div className="mt-xs flex items-center gap-[6px] text-[12.5px] text-on-surface-variant">
                                <span className="material-symbols-outlined text-[14px]" aria-hidden>location_on</span>
                                {e.venueName}{e.city ? `, ${e.city}` : ''}
                              </div>
                            )}
                          </div>
                          {viewMode === 'card' && (
                            <div className="h-[110px] w-[110px] overflow-hidden rounded-[12px] bg-surface-container" aria-hidden>
                              {e.hero_image_url ? (
                                <img src={e.hero_image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <FormatPlaceholder format={e.format} />
                              )}
                            </div>
                          )}
                        </div>
                        <ExpandableEventCard
                          hideTrigger
                          event={toRecord(e)}
                          open={expandedId === e.id}
                          onOpenChange={(open) => setExpandedId(open ? e.id : null)}
                        />
                      </Fragment>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Right — actions + calendar */}
          <aside className="flex flex-col gap-md">
            <div className="flex gap-sm">
              <Link
                href="/events/new"
                className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] border border-outline-variant bg-surface px-md py-sm text-[13px] font-semibold text-on-surface hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden>add</span>
                New event
              </Link>
              <span
                aria-disabled="true"
                title="Calendar subscription — coming soon"
                className="grid h-[36px] w-[36px] shrink-0 cursor-default place-items-center rounded-[10px] border border-outline-variant bg-surface text-on-surface-variant/60"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden>calendar_month</span>
              </span>
            </div>

            <MiniCalendar
              year={calMonth.year}
              month={calMonth.month}
              onPrev={() => setCalMonth(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }))}
              onNext={() => setCalMonth(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }))}
              todayKey={todayKey}
              selectedDay={selectedDay}
              eventDays={eventDays}
              onSelectDay={(key) => setSelectedDay((cur) => (cur === key ? null : key))}
              segment={segment}
              onSegmentChange={setSegment}
            />
          </aside>
        </div>
      </section>

      {/* 4 · Pulse metrics */}
      <div className="mb-xxl flex flex-wrap gap-sm">
        <PulseChip label="Registered (open)" value={metrics.openRegistered} foot={metrics.registered7d > 0 ? `+${metrics.registered7d} in 7 days` : 'no change in 7 days'} />
        <PulseChip label="Checked in today" value={metrics.checkedInToday} foot={metrics.captureRate != null ? `${metrics.captureRate}% capture rate` : 'no attendance yet'} />
        <PulseChip label="Credits issued" value={metrics.creditsIssued} foot={metrics.creditsBlocked > 0 ? `${metrics.creditsBlocked} blocked` : 'none blocked'} warn={metrics.creditsBlocked > 0} />
        <PulseChip label="Events this week" value={metrics.eventsThisWeek} foot={metrics.liveNow > 0 ? `${metrics.liveNow} live now` : `${metrics.closingSoon} closing in 7 days`} live={metrics.liveNow > 0} />
      </div>

      {/* 5 · Manage all events CTA */}
      <Link
        href="/dashboard/manage"
        className="inline-flex items-center gap-sm text-[calc(14px*var(--text-scale))] font-semibold text-[color:var(--on-primary-container)] hover:underline"
      >
        Manage all events
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>arrow_forward</span>
      </Link>
    </>
  );
}

function EmptyAgenda({ text, cta }: { text: string; cta: boolean }) {
  return (
    <div className="rounded-[16px] border border-outline-variant bg-surface p-xl text-center">
      <p className="text-body-md text-on-surface-variant">{text}</p>
      {cta && (
        <Link href="/events/new" className="inline-flex items-center gap-sm mt-md bg-primary text-on-primary font-label-md text-label-md rounded-full py-sm px-lg hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>add</span>Create event
        </Link>
      )}
    </div>
  );
}

function AvatarStack({ hosts }: { hosts: Array<{ name: string; avatar_url: string | null }> }) {
  const shown = hosts.slice(0, 3);
  return (
    <span className="inline-flex items-center -space-x-1" aria-hidden>
      {shown.map((h, i) => (
        <span
          key={i}
          className="grid h-[16px] w-[16px] place-items-center rounded-full bg-primary-container text-[8px] font-semibold text-on-primary-container ring-1 ring-[color:var(--sidebar)]"
        >
          {h.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

const FORMAT_GRADIENTS = [
  'linear-gradient(135deg, var(--primary), var(--tertiary))',
  'linear-gradient(135deg, var(--tertiary), var(--primary))',
  'linear-gradient(135deg, var(--secondary), var(--tertiary))',
];

function FormatPlaceholder({ format }: { format: EventFormat | null }) {
  const label = format ? FORMAT_LABEL[format].slice(0, 4).toUpperCase() : 'EVT';
  const idx = format ? format.charCodeAt(0) % FORMAT_GRADIENTS.length : 0;
  return (
    <div
      className="grid h-full w-full place-items-center text-[11px] font-bold uppercase tracking-wide text-white"
      style={{ backgroundImage: FORMAT_GRADIENTS[idx] }}
    >
      {label}
    </div>
  );
}

function AgendaStatusPill({ event }: { event: ProgrammeEvent }) {
  const cap = event.maxAttendees;
  const openForCapacity = event.lifecycle === 'registering' || event.lifecycle === 'upcoming';
  if (openForCapacity && cap != null && cap > 0) {
    if (event.registered >= cap) {
      return <Pill label="Sold out" cls="bg-error-container text-[color:var(--error)]" />;
    }
    if (event.registered >= cap * 0.9) {
      return <Pill label="Near capacity" cls="bg-warning-container text-on-surface" />;
    }
  }
  const pill = PILL[event.lifecycle];
  return <Pill label={pill.label} cls={pill.cls} />;
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-sm py-[2px] text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function MiniCalendar({
  year, month, onPrev, onNext, todayKey, selectedDay, eventDays, onSelectDay, segment, onSegmentChange,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  todayKey: string;
  selectedDay: string | null;
  eventDays: Set<string>;
  onSelectDay: (key: string) => void;
  segment: Segment;
  onSegmentChange: (s: Segment) => void;
}) {
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month));
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: startDay }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface p-md">
      <div className="mb-sm flex items-center justify-between">
        <span className="text-[13px] font-semibold text-on-surface">{monthName}</span>
        <div className="flex gap-xs">
          <button type="button" onClick={onPrev} aria-label="Previous month" className="grid h-[28px] w-[28px] place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_left</span>
          </button>
          <button type="button" onClick={onNext} aria-label="Next month" className="grid h-[28px] w-[28px] place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
          </button>
        </div>
      </div>

      <div className="mb-xs grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-[2px]">
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          const hasEvent = eventDays.has(key);
          return (
            <button
              key={i}
              type="button"
              aria-label={key}
              onClick={() => onSelectDay(key)}
              className={`relative mx-auto grid h-[28px] w-[28px] place-items-center rounded-full text-[12px] font-medium ${
                isSelected
                  ? 'bg-[color:var(--on-primary-container)] font-bold text-white'
                  : isToday
                    ? 'font-bold text-[color:var(--on-primary-container)]'
                    : 'text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {d}
              {hasEvent && !isSelected && (
                <span className="absolute bottom-[2px] left-1/2 h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-[color:var(--on-primary-container)]" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-md flex items-center gap-xs rounded-full bg-surface-container-high p-[3px]">
        {(['upcoming', 'past'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={segment === s}
            onClick={() => onSegmentChange(s)}
            className={`flex-1 rounded-full py-[5px] text-center text-[12px] font-semibold capitalize ${
              segment === s
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function PulseChip({ label, value, foot, warn, live }: { label: string; value: number; foot: string; warn?: boolean; live?: boolean }) {
  return (
    <div className="flex-1 min-w-[160px] rounded-[12px] border border-outline-variant bg-surface p-md">
      <div className="flex items-center justify-between mb-xs">
        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="text-[18px] font-bold tabular-nums text-on-surface">{value}</p>
      </div>
      <p className={`text-[11px] ${warn ? 'text-[color:var(--warning)]' : live ? 'text-[color:var(--success)]' : 'text-on-surface-variant'}`}>{foot}</p>
    </div>
  );
}
