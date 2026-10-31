import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';
import { StaffShell, NavRow, type StaffNavItem } from '@/components/shell/StaffShell';
import { buttonVariants, Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { cn } from '@/lib/utils';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { Icon } from '../ux-01/parts';

export { Frame, Icon, Option, Section } from '../ux-01/parts';

// Specimen building blocks for the CX-04R round (the Events home). Sample data only, nothing wired. The shell, Button,
// Input, Select and StatusPill are the real components. The agenda row, event card, month calendar and bulk bar are
// redrawn from the product's own class strings because ProgrammeEvent rows, ManageEventCard and MiniCalendar are not
// exported (CX-04R is where they get merged).

export const STAFF = { email: 'mei@sample.test', role: 'organiser_member' as const, full_name: 'Mei Organiser' };

const NAV3: StaffNavItem[] = [
  { label: 'Check-in', href: '/checkin', icon: 'how_to_reg' },
  { label: 'Events', href: '/dashboard', icon: 'event' },
  { label: 'History', href: '/analytics', icon: 'history' },
];

export type Ev = {
  id: string;
  title: string;
  life: Lifecycle;
  day: string;
  head: string;
  time: string;
  venue: string;
  fmt: string;
  mine: boolean;
  reg: number;
  cap: number;
  checked?: number;
  passed?: boolean;
};

export const ACTIVE: Ev[] = [
  { id: 'a1', title: 'Heart Failure in Primary Care: 2026 Update', life: 'live', day: '2026-11-02', head: 'Today, Monday 2 November', time: '14:00 to 17:00', venue: 'Hong Kong Academy of Medicine', fmt: 'Seminar', mine: true, reg: 86, cap: 120, checked: 41 },
  { id: 'a2', title: 'Evening Case Review', life: 'registering', day: '2026-11-02', head: 'Today, Monday 2 November', time: '18:30 to 19:30', venue: 'Online', fmt: 'Webinar', mine: true, reg: 22, cap: 60 },
  { id: 'a3', title: 'Diabetic Foot Care for Nurses', life: 'registering', day: '2026-11-05', head: 'Thursday 5 November', time: '09:30 to 12:30', venue: 'Queen Elizabeth Hospital', fmt: 'Workshop', mine: false, reg: 40, cap: 45 },
  { id: 'a4', title: 'Radiology Case Conference', life: 'upcoming', day: '2026-11-12', head: 'Thursday 12 November', time: '13:00 to 17:00', venue: 'Prince of Wales Hospital', fmt: 'Conference', mine: true, reg: 64, cap: 200 },
  { id: 'a5', title: 'Palliative Care Symposium', life: 'registering', day: '2026-11-19', head: 'Thursday 19 November', time: '09:00 to 16:00', venue: 'Hong Kong Convention Centre', fmt: 'Symposium', mine: true, reg: 118, cap: 120 },
];

export const DRAFTS: Ev[] = [
  { id: 'd1', title: 'Antimicrobial Stewardship Workshop', life: 'drafted', day: '2026-10-14', head: 'Wednesday 14 October', time: '10:00 to 13:00', venue: 'Not set', fmt: 'Workshop', mine: true, reg: 0, cap: 40, passed: true },
  { id: 'd2', title: 'Paediatric Asthma Masterclass', life: 'drafted', day: '2026-11-12', head: 'Thursday 12 November', time: '14:00 to 17:00', venue: 'Prince of Wales Hospital', fmt: 'Lecture', mine: true, reg: 0, cap: 80 },
  { id: 'd3', title: 'Hypertension Update Webinar', life: 'drafted', day: '2026-11-26', head: 'Thursday 26 November', time: '19:00 to 20:00', venue: 'Online', fmt: 'Webinar', mine: false, reg: 0, cap: 150 },
];

export const COUNTS = { active: 187, drafts: 41, cancelled: 14 };
type Tab = 'active' | 'drafts';

const SORT_ITEMS = { soonest: 'Soonest', recent: 'Most recent', most: 'Most registered' };
const T11 = 'text-[calc(11px*var(--text-scale))]';

/* ------------------------------ shells ------------------------------ */

export function Desktop({ children }: { children: ReactNode }) {
  return (
    // The shell's sidebar is viewport-tall (md:h-screen); the frame is shorter, so pin the sidebar to the frame.
    <div className="h-[640px] overflow-hidden md:h-[780px] md:[&_aside]:!h-[780px]">
      <StaffShell staff={STAFF} navItems={NAV3} activeHref="/dashboard">
        {children}
      </StaffShell>
    </div>
  );
}

/** The shell's own phone layout is the same aside as a strip. Media queries read the browser, not the frame, so the strip is drawn with the real NavRow. */
export function Phone({ children }: { children: ReactNode }) {
  const items = [...NAV3, { label: 'Settings', href: '/settings', icon: 'settings' }];
  return (
    <div className="app-atmo mx-auto w-full max-w-[375px] text-on-surface">
      <div className="flex flex-col gap-md bg-sidebar p-md">
        <BrandMark compact href="/dashboard" />
        <nav aria-label="Primary" className="flex gap-xs overflow-x-auto">
          {items.map((i) => (
            <NavRow key={i.label} {...i} active={i.href === '/dashboard'} />
          ))}
        </nav>
      </div>
      <div className="bg-sidebar p-md pt-0">{children}</div>
    </div>
  );
}

/* ------------------------------ page parts ------------------------------ */

function Head({ total }: { total: number }) {
  return (
    <header className="mb-md flex flex-wrap items-center justify-between gap-md">
      <div>
        <h1 className="text-[calc(28px*var(--text-scale))] font-bold tracking-[-0.02em] text-on-surface">Events</h1>
        <p className="text-[calc(13px*var(--text-scale))] text-on-surface-variant">{total} events. Dates and times are in each event&rsquo;s local time.</p>
      </div>
      <Link href="/events/new" className={cn(buttonVariants(), 'h-11 gap-xs px-lg font-label-md text-label-md')}>
        <Icon name="add" className="text-[calc(18px*var(--text-scale))]" />
        New event
      </Link>
    </header>
  );
}

function Tabs({ tab, deleted = 0 }: { tab: Tab; deleted?: number }) {
  const tabs: [string, string, number][] = [
    ['active', 'Active', COUNTS.active],
    ['drafts', 'Drafts', COUNTS.drafts],
    ['cancelled', 'Cancelled', COUNTS.cancelled],
    ['deleted', 'Deleted', deleted],
  ];
  return (
    <div role="tablist" aria-label="Event state" className="-mx-grid-margin mb-md flex items-center gap-lg overflow-x-auto border-b border-outline-variant px-grid-margin">
      {tabs.map(([k, label, n]) => {
        if (k === 'deleted' && n === 0) return null;
        const on = k === tab;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} className={cn('relative flex min-h-11 shrink-0 items-center font-label-md text-label-md', on ? 'text-on-surface' : 'text-on-surface-variant')}>
            {label}
            <span className={cn('ml-xs inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-semibold', T11, on ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>{n}</span>
            {on && <span aria-hidden className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-[color:var(--on-primary-container)]" />}
          </button>
        );
      })}
    </div>
  );
}

function Search({ sort }: { sort?: boolean }) {
  return (
    <div className="mb-md flex flex-col gap-sm @min-[560px]:flex-row">
      <div className="relative flex-1">
        <Icon name="search" className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <Input type="text" placeholder="Search events" aria-label="Search events" className="h-11 w-full py-sm pl-[42px] pr-md text-body-md" />
      </div>
      {sort && (
        <div className="inline-flex min-h-11 shrink-0 items-center gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest px-md">
          <Icon name="swap_vert" className="text-on-surface-variant" />
          <span className="font-label-md text-label-md uppercase text-on-surface-variant">Sort</span>
          <Select items={SORT_ITEMS} defaultValue="soonest">
            <SelectTrigger aria-label="Sort events" className="border-none bg-transparent p-0 font-label-md text-label-md text-on-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_ITEMS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function Chips({ list }: { list: Ev[] }) {
  const counts = new Map<string, number>();
  list.forEach((e) => counts.set(e.fmt, (counts.get(e.fmt) ?? 0) + 1));
  return (
    <div className="mb-md flex flex-wrap gap-[6px]">
      {[...counts].map(([f, n], i) => (
        <span key={f} className={cn('inline-flex min-h-8 items-center rounded-full border px-[12px] text-[calc(12.5px*var(--text-scale))] font-medium', i === 0 ? 'border-transparent bg-primary-container font-semibold text-on-primary-container' : 'border-outline-variant text-on-surface-variant')}>
          {f} · {n}
        </span>
      ))}
    </div>
  );
}

export function BulkBar({ n, inDrafts }: { n: number; inDrafts: boolean }) {
  const b = 'gap-xs px-md py-sm font-label-md text-label-md min-h-11';
  return (
    <div className="mb-md flex flex-wrap items-center justify-between gap-md rounded-lg border border-[color:var(--primary-fixed-dim)] bg-primary-container/60 px-md py-sm">
      <span className="font-label-md text-label-md font-semibold text-on-surface">{n} selected</span>
      <div className="flex flex-wrap items-center gap-xs">
        <Button type="button" variant="outline" className={b}><Icon name="download" className="text-[calc(16px*var(--text-scale))]" />Export CSV</Button>
        <Button type="button" variant="outline" className={b}><Icon name="delete" className="text-[calc(16px*var(--text-scale))]" />Delete</Button>
        {!inDrafts && <Button type="button" variant="destructive" className={b}><Icon name="block" className="text-[calc(16px*var(--text-scale))]" />Cancel</Button>}
        <Button type="button" variant="ghost" className={cn(b, 'text-on-surface-variant')}>Clear</Button>
      </div>
    </div>
  );
}

function Foot({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="mt-lg flex flex-wrap items-center justify-between gap-sm text-[calc(13px*var(--text-scale))] text-on-surface-variant">
      <span>Showing {shown} of {total}. Search or pick a day to narrow the list.</span>
      <Button type="button" variant="outline" className="min-h-11 px-md font-label-md text-label-md">Show 20 more</Button>
    </div>
  );
}

function Check({ on, mine, title }: { on: boolean; mine: boolean; title: string }) {
  // Only on events the viewer created (every event for eventar_staff). The slot stays so rows align.
  return (
    <span className="grid size-11 shrink-0 place-items-center">
      {mine && <input type="checkbox" checked={on} readOnly aria-label={`Select ${title}`} className="size-[18px] accent-[color:var(--on-primary-container)]" />}
    </span>
  );
}

function Links({ id, ghost }: { id: string; ghost?: boolean }) {
  const v = ghost ? 'ghost' : 'outline';
  const c = cn('min-h-11 gap-xs px-md font-label-md text-label-md');
  return (
    <div className="flex flex-wrap gap-xs">
      <Link href={`/events/${id}/details`} className={cn(buttonVariants({ variant: v }), c)}>Details</Link>
      <Link href={`/events/${id}/edit`} className={cn(buttonVariants({ variant: v }), c)}>Edit</Link>
      <Link href={`/events/${id}/checkin`} className={cn(buttonVariants({ variant: v }), c)}>Check-in</Link>
    </div>
  );
}

function Meta({ e }: { e: Ev }) {
  return (
    <div className="mt-xs flex flex-wrap items-center gap-x-md gap-y-xs text-[calc(12.5px*var(--text-scale))] text-on-surface-variant">
      <span className="inline-flex items-center gap-xs"><Icon name="location_on" className="text-[calc(14px*var(--text-scale))]" />{e.venue}</span>
      <span>{e.fmt}</span>
      {e.life !== 'drafted' && <span className="tabular-nums">{e.reg} / {e.cap} registered{e.checked != null ? `, ${e.checked} checked in` : ''}</span>}
      {!e.mine && <span>Created by Dr Chan</span>}
    </div>
  );
}

const Passed = () => <p className="mt-xs text-[calc(12.5px*var(--text-scale))] font-medium text-on-surface">The date has passed. Edit the date to publish this draft.</p>;

/* ------------------------------ rows and cards ------------------------------ */

function AgendaRow({ e, on, quiet }: { e: Ev; on: boolean; quiet?: boolean }) {
  return (
    <li className={cn('flex items-start gap-xs p-xs', quiet ? cn('rounded-[12px]', on && 'bg-primary-container/40') : cn('rounded-[14px] border border-outline-variant bg-surface-container-lowest', on && 'border-[color:var(--primary-fixed-dim)] bg-primary-container/30'))}>
      <Check on={on} mine={e.mine} title={e.title} />
      <div className="w-[88px] shrink-0 pt-sm text-[calc(13px*var(--text-scale))] tabular-nums text-on-surface-variant">{e.time.split(' to ')[0]}</div>
      <div className="min-w-0 flex-1 pb-xs pt-xs">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <Link href={`/events/${e.id}/details`} className={cn('font-semibold leading-[1.35] text-on-surface hover:text-[color:var(--on-primary-container)]', quiet ? 'text-[calc(18px*var(--text-scale))]' : 'text-[calc(16px*var(--text-scale))]')}>{e.title}</Link>
          <StatusPill lifecycle={e.life} />
        </div>
        <Meta e={e} />
        {e.passed && <Passed />}
        <div className="mt-sm"><Links id={e.id} ghost={quiet} /></div>
      </div>
    </li>
  );
}

function Agenda({ list, ticks, quiet }: { list: Ev[]; ticks: string[]; quiet?: boolean }) {
  const days = [...new Set(list.map((e) => e.day))].sort();
  return (
    <div data-testid="agenda">
      {days.map((d) => {
        const rows = list.filter((e) => e.day === d);
        const [wd, ...rest] = rows[0].head.replace('Today, ', '').split(' ');
        return (
          <div key={d} className="mb-md">
            <div className={cn('sticky top-0 z-[1] flex items-baseline gap-sm py-sm', quiet ? 'rounded-[12px] bg-surface-container-low px-sm' : 'border-b border-outline-variant bg-sidebar')}>
              <span className={cn('font-bold text-on-surface', quiet ? 'text-[calc(22px*var(--text-scale))]' : 'text-[calc(15px*var(--text-scale))]')}>{rest.join(' ')}</span>
              <span className="text-[calc(15px*var(--text-scale))] text-on-surface-variant">{rows[0].head.startsWith('Today') ? `Today, ${wd}` : wd}</span>
            </div>
            <ul className={cn('flex flex-col pt-sm', quiet ? 'gap-md' : 'gap-sm')}>
              {rows.map((e) => <AgendaRow key={e.id} e={e} on={ticks.includes(e.id)} quiet={quiet} />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const STRIPE: Record<Lifecycle, string> = {
  live: 'bg-[color:var(--success)]',
  registering: 'bg-[color:var(--success)]',
  drafted: 'bg-[color:var(--warning)]',
  cancelled: 'bg-[color:var(--error)]',
  upcoming: 'bg-[color:var(--on-primary-container)]',
  completed: 'bg-outline-variant',
};

function EventCard({ e, on, nested }: { e: Ev; on: boolean; nested?: boolean }) {
  const pct = Math.min(100, Math.round((e.reg / e.cap) * 100));
  const inner = (
    <div className={cn('relative flex flex-col overflow-hidden @min-[640px]:flex-row @min-[640px]:items-stretch', nested ? 'rounded-[14px] bg-surface-container-lowest' : cn('rounded-[16px] border border-outline-variant bg-surface-container-lowest', on && 'border-[color:var(--primary-fixed-dim)]'))}>
      {!nested && <span aria-hidden className={cn('h-[4px] w-full shrink-0 @min-[640px]:h-auto @min-[640px]:w-[4px]', STRIPE[e.life])} />}
      <div className="flex min-w-0 flex-1 items-start gap-xs p-sm">
        <Check on={on} mine={e.mine} title={e.title} />
        <div className="min-w-0 flex-1 pt-xs">
          <div className="flex flex-wrap items-center gap-sm">
            <Link href={`/events/${e.id}/details`} className="font-title-lg text-title-lg font-semibold text-on-surface hover:text-[color:var(--on-primary-container)]">{e.title}</Link>
            <StatusPill lifecycle={e.life} />
          </div>
          <div className="mt-xs flex flex-wrap items-center gap-md text-[calc(12.5px*var(--text-scale))] text-on-surface-variant">
            <span className="inline-flex items-center gap-xs"><Icon name="calendar_today" className="text-[calc(14px*var(--text-scale))]" />{e.head.replace('Today, ', '')}</span>
            <span className="inline-flex items-center gap-xs"><Icon name="schedule" className="text-[calc(14px*var(--text-scale))]" />{e.time}</span>
            <span className="inline-flex items-center gap-xs"><Icon name="location_on" className="text-[calc(14px*var(--text-scale))]" />{e.venue}</span>
            {!e.mine && <span>Created by Dr Chan</span>}
          </div>
          {e.passed && <Passed />}
          {e.life !== 'drafted' && (
            <div className="mt-sm max-w-[200px]">
              <p className="leading-none"><span className="text-[calc(22px*var(--text-scale))] font-extrabold tabular-nums text-[color:var(--on-primary-container)]">{e.reg}</span><span className="text-body-md text-on-surface-variant"> / {e.cap} registered</span></p>
              <span aria-hidden className="mt-xs block h-[4px] overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-[color:var(--success)]" style={{ width: `${pct}%` }} /></span>
              {e.checked != null && <p className="mt-xs text-[calc(12.5px*var(--text-scale))] font-semibold text-[color:var(--success)]">{e.checked} checked in</p>}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-xs px-sm pb-sm @min-[640px]:w-[150px] @min-[640px]:shrink-0 @min-[640px]:flex-col @min-[640px]:items-stretch @min-[640px]:justify-center @min-[640px]:p-sm">
        {nested ? <NestedLinks id={e.id} /> : <CardLinks id={e.id} />}
      </div>
    </div>
  );
  if (!nested) return <li>{inner}</li>;
  return <li className="rounded-[18px] border border-outline-variant bg-surface-container-high p-[4px]">{inner}</li>;
}

/** Reference: React Bits Pro Card 4 (date cell, inset title panel, action row under it). Layout and style only, built from Eventar tokens. */
export function DatedCard({ e, on }: { e: Ev; on: boolean }) {
  const day = Number(e.day.slice(8));
  const wd = e.head.replace('Today, ', '').split(' ')[0].slice(0, 3);
  const c = 'min-h-11 w-full gap-xs px-sm font-label-md text-label-md';
  // The filled button is the next thing an organiser does: check people in while the event is live or open.
  const doorNow = e.life === 'live' || e.life === 'registering';
  return (
    <li className={cn('grid grid-cols-[64px_minmax(0,1fr)] gap-sm rounded-[16px] border bg-surface-container-lowest p-sm @min-[640px]:grid-cols-[88px_minmax(0,1fr)]', on ? 'border-[color:var(--primary-fixed-dim)]' : 'border-outline-variant')}>
      <div className="col-span-full"><StatusPill lifecycle={e.life} /></div>
      <div className="flex flex-col items-center justify-center text-center">
        <span className="text-[calc(28px*var(--text-scale))] font-bold leading-none tabular-nums text-on-surface">{day}</span>
        <span className="mt-xs text-[calc(13px*var(--text-scale))] text-on-surface-variant">{wd}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-xs">
        <div className="flex items-start gap-xs rounded-[12px] bg-surface-container p-sm">
          <Check on={on} mine={e.mine} title={e.title} />
          <div className="min-w-0 flex-1 pt-xs">
            <Link href={`/events/${e.id}/details`} className="font-title-lg text-title-lg font-semibold text-on-surface hover:text-[color:var(--on-primary-container)]">{e.title}</Link>
            <p className="mt-xs flex items-center gap-xs text-[calc(12.5px*var(--text-scale))] tabular-nums text-on-surface-variant"><Icon name="schedule" className="text-[calc(14px*var(--text-scale))]" />{e.time}</p>
            <Meta e={e} />
            {e.passed && <Passed />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-xs">
          <Link href={`/events/${e.id}/details`} className={cn(buttonVariants({ variant: 'outline' }), c)}>Details</Link>
          <Link href={`/events/${e.id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), c)}>Edit</Link>
          <Link href={`/events/${e.id}/checkin`} className={cn(buttonVariants({ variant: doorNow ? 'default' : 'outline' }), c)}>Check-in</Link>
        </div>
      </div>
    </li>
  );
}

function CardLinks({ id }: { id: string }) {
  const c = 'min-h-11 w-full gap-xs px-sm font-label-md text-label-md';
  return (
    <>
      <Link href={`/events/${id}/details`} className={cn(buttonVariants({ variant: 'outline' }), c)}><Icon name="info" className="text-[calc(16px*var(--text-scale))]" />Details</Link>
      <Link href={`/events/${id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), c)}><Icon name="edit" className="text-[calc(16px*var(--text-scale))]" />Edit</Link>
      <Link href={`/events/${id}/checkin`} className={cn(buttonVariants({ variant: 'outline' }), c)}><Icon name="how_to_reg" className="text-[calc(16px*var(--text-scale))]" />Check-in</Link>
    </>
  );
}

/** Nested-shell position: a pill whose arrow sits in its own circle. */
function NestedLinks({ id }: { id: string }) {
  const c = 'group min-h-11 w-full justify-between gap-sm pl-md pr-xs font-label-md text-label-md';
  const dot = <span aria-hidden className="grid size-8 place-items-center rounded-full bg-on-surface/10"><Icon name="arrow_outward" className="text-[calc(16px*var(--text-scale))]" /></span>;
  return (
    <>
      <Link href={`/events/${id}/details`} className={cn(buttonVariants(), c)}>Details{dot}</Link>
      <Link href={`/events/${id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), c)}>Edit{dot}</Link>
      <Link href={`/events/${id}/checkin`} className={cn(buttonVariants({ variant: 'outline' }), c)}>Check-in{dot}</Link>
    </>
  );
}

/* ------------------------------ calendar rail and month strip ------------------------------ */

function Rail({ days }: { days: Set<string> }) {
  const first = new Date(2026, 10, 1);
  const start = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = Array.from({ length: start }, () => null);
  for (let d = 1; d <= 30; d++) cells.push(d);
  return (
    <aside aria-label="Calendar" className="rounded-[14px] border border-outline-variant bg-surface p-md">
      <div className="mb-sm flex items-center justify-between">
        <span className="text-[calc(13px*var(--text-scale))] font-semibold text-on-surface">November 2026</span>
        <div className="flex gap-xs">
          <span className="grid size-8 place-items-center rounded-full text-on-surface-variant"><Icon name="chevron_left" /></span>
          <span className="grid size-8 place-items-center rounded-full text-on-surface-variant"><Icon name="chevron_right" /></span>
        </div>
      </div>
      <div className="mb-xs grid grid-cols-7 text-center text-[calc(10px*var(--text-scale))] font-semibold uppercase tracking-wider text-on-surface-variant">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-[2px]">
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />;
          const key = `2026-11-${String(d).padStart(2, '0')}`;
          return (
            <span key={i} className={cn('relative mx-auto grid size-8 place-items-center rounded-full text-[calc(12px*var(--text-scale))] font-medium', key === '2026-11-02' ? 'bg-primary font-bold text-on-primary' : 'text-on-surface')}>
              {d}
              {days.has(key) && key !== '2026-11-02' && <span aria-hidden className="absolute bottom-[2px] left-1/2 size-[4px] -translate-x-1/2 rounded-full bg-[color:var(--on-primary-container)]" />}
            </span>
          );
        })}
      </div>
    </aside>
  );
}

function Strip({ days }: { days: Set<string> }) {
  const dow = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div aria-label="Next two weeks" className="mb-md flex items-center gap-xs rounded-[14px] border border-outline-variant bg-surface p-xs">
      <span className="grid size-8 shrink-0 place-items-center rounded-full text-on-surface-variant"><Icon name="chevron_left" /></span>
      <div className="flex min-w-0 flex-1 gap-[2px]">
        {Array.from({ length: 14 }, (_, i) => {
          const d = 2 + i;
          const key = `2026-11-${String(d).padStart(2, '0')}`;
          return (
            <span key={d} className={cn('relative flex min-w-0 flex-1 flex-col items-center rounded-full py-xs text-[calc(11px*var(--text-scale))]', d === 2 ? 'bg-primary font-bold text-on-primary' : 'text-on-surface')}>
              <span className={d === 2 ? '' : 'text-on-surface-variant'}>{dow[i % 7]}</span>
              <span className="font-medium">{d}</span>
              {days.has(key) && d !== 2 && <span aria-hidden className="absolute bottom-[2px] size-[4px] rounded-full bg-[color:var(--on-primary-container)]" />}
            </span>
          );
        })}
      </div>
      <span className="grid size-8 shrink-0 place-items-center rounded-full text-on-surface-variant"><Icon name="chevron_right" /></span>
    </div>
  );
}

/* ------------------------------ the page body ------------------------------ */

export type Layout = 'rail' | 'cards' | 'strip' | 'quiet' | 'nested' | 'dated';

export function EventsHome({ layout, tab = 'active', ticks = [], deleted = 0 }: { layout: Layout; tab?: Tab; ticks?: string[]; deleted?: number }) {
  const base = tab === 'drafts' ? DRAFTS : ACTIVE;
  // Cards pin a live event first, then order by date.
  const list = layout === 'cards' || layout === 'nested' ? [...base].sort((a, b) => Number(b.life === 'live') - Number(a.life === 'live') || a.day.localeCompare(b.day)) : base;
  const days = new Set(base.map((e) => e.day));
  const total = tab === 'drafts' ? COUNTS.drafts : COUNTS.active;
  const agenda = layout === 'rail' || layout === 'strip' || layout === 'quiet';
  const body = agenda ? (
    <Agenda list={list} ticks={ticks} quiet={layout === 'quiet'} />
  ) : layout === 'dated' ? (
    <ul className="flex flex-col gap-sm">{list.map((e) => <DatedCard key={e.id} e={e} on={ticks.includes(e.id)} />)}</ul>
  ) : (
    <ul className="flex flex-col gap-sm">{list.map((e) => <EventCard key={e.id} e={e} on={ticks.includes(e.id)} nested={layout === 'nested'} />)}</ul>
  );
  return (
    <div className="@container min-w-0">
      <Head total={COUNTS.active + COUNTS.drafts + COUNTS.cancelled} />
      <Tabs tab={tab} deleted={deleted} />
      <Search sort={!agenda} />
      {agenda && <Chips list={base} />}
      {layout === 'strip' && <Strip days={days} />}
      {ticks.length > 0 && <BulkBar n={ticks.length} inDrafts={tab === 'drafts'} />}
      {layout === 'rail' ? (
        <div className="grid grid-cols-1 gap-lg @min-[680px]:grid-cols-[minmax(0,1fr)_240px]">
          {body}
          <div className="@min-[680px]:sticky @min-[680px]:top-0 @min-[680px]:self-start"><Rail days={days} /></div>
        </div>
      ) : body}
      <Foot shown={base.length} total={total} />
    </div>
  );
}
