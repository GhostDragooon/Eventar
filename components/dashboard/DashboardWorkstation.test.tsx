/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Server actions are no longer imported by DashboardWorkstation (manage moved
// to its own route), but keep the mock in case a transitive import pulls them.
vi.mock('@/app/dashboard/actions', () => ({
  softDeleteEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
  cancelEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
  restoreEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
}));

// The component syncs the eventar-tz cookie and calls router.refresh().
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/toast';
import { DashboardWorkstation, type ProgrammeEvent } from './DashboardWorkstation';

afterEach(cleanup);
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // jsdom always has localStorage; guard kept symmetric with the component.
  }
});

const HOUR = 3_600_000;
const NOW = Date.now();

// Fixture events are Hong Kong events: dayKey is the HK calendar date of startMs.
const hkDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' });

function event(overrides: Partial<ProgrammeEvent>): ProgrammeEvent {
  const startMs = overrides.startMs ?? NOW + 24 * HOUR;
  return {
    id: 'e-1',
    title: 'Sample Event',
    description: null,
    lifecycle: 'registering',
    startMs,
    dayKey: hkDay.format(startMs),
    dateLabel: 'Fri 4 Jul',
    timeLabel: '19:30 HKT',
    venueName: 'Hall A',
    maxAttendees: 100,
    registered: 10,
    attended: 0,
    delta7: 0,
    closesInDays: 3,
    category: null,
    deleted: false,
    format: null,
    hero_image_url: null,
    city: null,
    hosts: [],
    ...overrides,
  };
}

const metrics = {
  openRegistered: 10, registered7d: 2, eventsThisWeek: 1, closingSoon: 1,
  checkedInToday: 4, captureRate: 80, creditsIssued: 12, creditsBlocked: 0, liveNow: 1,
};

function renderBoard(events: ProgrammeEvent[], opts: { nowMs?: number; tz?: string } = {}) {
  return render(
    <ToastProvider>
      <DashboardWorkstation
        events={events}
        attention={[]}
        metrics={metrics}
        orgName="Test Org"
        nowMs={opts.nowMs ?? NOW}
        tz={opts.tz ?? 'Asia/Hong_Kong'}
      />
    </ToastProvider>,
  );
}

function agenda() {
  return within(screen.getByTestId('agenda'));
}

describe('DashboardWorkstation — organiser timezone (eventar-tz cookie)', () => {
  const entry = `eventar-tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  beforeEach(() => {
    document.cookie = 'eventar-tz=; path=/; max-age=0';
    refresh.mockClear();
  });

  it('writes the browser zone and re-renders once when the cookie is missing, then never again', () => {
    renderBoard([]);
    expect(document.cookie.split('; ')).toContain(entry);
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
    renderBoard([]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('never refreshes when the browser refuses the cookie', () => {
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => {} });
    try {
      renderBoard([]);
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'cookie');
    }
  });

  it("rings the calendar's today on the organiser's date, not Hong Kong's", () => {
    // Thu 15 Oct 10:00 in Hong Kong is still Wed 14 Oct 22:00 for a New York organiser.
    renderBoard([], { nowMs: Date.parse('2026-10-15T02:00:00Z'), tz: 'America/New_York' });
    const ringed = (day: string) => screen.getByRole('button', { name: day }).className.includes('font-bold');
    expect(ringed('2026-10-14')).toBe(true);
    expect(ringed('2026-10-15')).toBe(false);
  });

  it("groups an event under its own local date, not the organiser's", () => {
    // Tue 20 Oct 10:00 HKT is still Mon 19 Oct 22:00 for a New York organiser.
    const startMs = Date.parse('2026-10-20T02:00:00Z');
    renderBoard([event({ id: 'hk', title: 'HK Event', startMs, dayKey: '2026-10-20' })], {
      nowMs: Date.parse('2026-10-16T02:00:00Z'),
      tz: 'America/New_York',
    });
    expect(agenda().getByText('20 Oct')).toBeInTheDocument();
    expect(agenda().getByText('Tuesday')).toBeInTheDocument();
    expect(agenda().queryByText('19 Oct')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2026-10-20' }));
    expect(agenda().getByText('HK Event')).toBeInTheDocument();
  });

  it('orders agenda days by date when events sit in different zones', () => {
    // HK early starts first in absolute time but on the later local date.
    const mixed = (lifecycle: ProgrammeEvent['lifecycle']) => [
      event({ id: 'hk-early', title: 'HK early', lifecycle, startMs: Date.parse('2026-10-26T22:00:00Z'), dayKey: '2026-10-27' }),
      event({ id: 'london', title: 'London', lifecycle, startMs: Date.parse('2026-10-26T23:30:00Z'), dayKey: '2026-10-26' }),
      event({ id: 'hk-late', title: 'HK late', lifecycle, startMs: Date.parse('2026-10-27T02:00:00Z'), dayKey: '2026-10-27' }),
    ];
    const order = () => {
      const t = agenda().getByText('London').closest('[data-testid="agenda"]')!.textContent!;
      return [t.indexOf('26 Oct'), t.indexOf('27 Oct')];
    };

    renderBoard(mixed('registering'), { nowMs: Date.parse('2026-10-16T02:00:00Z') });
    const [up26, up27] = order();
    expect(up26).toBeLessThan(up27);

    // Past, newest first. Without HK late, a start-time-only sort would list 26 Oct first.
    cleanup();
    renderBoard(mixed('completed').filter((e) => e.id !== 'hk-late'), { nowMs: Date.parse('2026-10-30T02:00:00Z') });
    fireEvent.click(screen.getByRole('button', { name: /^past$/i }));
    const [past26, past27] = order();
    expect(past27).toBeLessThan(past26);
  });
});

describe('DashboardWorkstation — programme home', () => {
  it('defaults to card view and persists the toggle to localStorage', () => {
    renderBoard([event({})]);
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Compact view' }));
    expect(localStorage.getItem('eventar.programme.view')).toBe('compact');
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('each agenda row links to its event details page', () => {
    renderBoard([
      event({ id: 'e-one', title: 'Alpha Row' }),
      event({ id: 'e-two', title: 'Bravo Row', startMs: NOW + 48 * HOUR }),
    ]);
    expect(agenda().getByRole('link', { name: /Alpha Row/ })).toHaveAttribute('href', '/events/e-one/details');
    expect(agenda().getByRole('link', { name: /Bravo Row/ })).toHaveAttribute('href', '/events/e-two/details');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says what the page is for, right under the title', () => {
    renderBoard([event({})]);
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveTextContent(
      'Your events by date, including drafts. Open one to work on it.',
    );
  });

  it('clearing the search box on close does not leave the agenda silently filtered', () => {
    renderBoard([
      event({ id: 'keep', title: 'Keep Me' }),
      event({ id: 'other', title: 'Other Event' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Search events' }));
    fireEvent.change(screen.getByLabelText('Search your programme'), { target: { value: 'Keep' } });
    expect(agenda().getByText('Keep Me')).toBeInTheDocument();
    expect(agenda().queryByText('Other Event')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Search events' }));
    expect(agenda().getByText('Keep Me')).toBeInTheDocument();
    expect(agenda().getByText('Other Event')).toBeInTheDocument();
  });

  it('filters the agenda by format chip', () => {
    renderBoard([
      event({ id: 'conf-1', title: 'Conf Event', format: 'conference' }),
      event({ id: 'sem-1', title: 'Sem Event', format: 'seminar' }),
    ]);
    expect(agenda().getByText('Conf Event')).toBeInTheDocument();
    expect(agenda().getByText('Sem Event')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Conference · 1/ }));
    expect(agenda().getByText('Conf Event')).toBeInTheDocument();
    expect(agenda().queryByText('Sem Event')).toBeNull();
  });

  it('filters the agenda to a picked calendar day, with a clear-filter chip', () => {
    const fixedNow = new Date('2027-03-15T04:00:00Z').getTime(); // 12:00 HKT
    const onDay = new Date('2027-03-20T02:00:00Z').getTime(); // 10:00 HKT, 20 Mar
    const otherDay = new Date('2027-03-22T02:00:00Z').getTime();
    renderBoard(
      [
        event({ id: 'on-day', title: 'On The Day', startMs: onDay }),
        event({ id: 'other-day', title: 'Other Day', startMs: otherDay }),
      ],
      { nowMs: fixedNow },
    );
    fireEvent.click(screen.getByRole('button', { name: '2027-03-20' }));
    expect(agenda().getByText('On The Day')).toBeInTheDocument();
    expect(agenda().queryByText('Other Day')).toBeNull();
    expect(screen.getByText(/clear filter/i)).toBeInTheDocument();
  });

  it('the Upcoming/Past segment toggle switches which agenda events show', () => {
    renderBoard([
      event({ id: 'future', title: 'Future Event', startMs: NOW + 48 * HOUR }),
      event({ id: 'past', title: 'Past Event', startMs: NOW - 48 * HOUR, lifecycle: 'completed' }),
    ]);
    expect(agenda().getByText('Future Event')).toBeInTheDocument();
    expect(agenda().queryByText('Past Event')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^past$/i }));
    expect(agenda().getByText('Past Event')).toBeInTheDocument();
    expect(agenda().queryByText('Future Event')).toBeNull();
  });

  it('programme rows have no checkboxes', () => {
    renderBoard([event({ id: 'e1' }), event({ id: 'e2' })]);
    expect(agenda().queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('lists a draft on the programme agenda with the Draft chip, linked to its details page', () => {
    renderBoard([event({ id: 'd1', title: 'Draft Event', lifecycle: 'drafted' })]);
    const row = agenda().getByRole('link', { name: /Draft Event/ });
    expect(row).toHaveAttribute('href', '/events/d1/details');
    expect(within(row).getByText('Draft')).toBeInTheDocument();
  });

  it('puts drafts among the other events in date order', () => {
    const fixedNow = new Date('2027-03-15T04:00:00Z').getTime(); // 12:00 HKT
    const at = (iso: string) => new Date(iso).getTime();
    renderBoard(
      [
        event({ id: 'later', title: 'Published Later', startMs: at('2027-03-25T02:00:00Z') }),
        event({ id: 'draft', title: 'Draft Between', lifecycle: 'drafted', startMs: at('2027-03-20T02:00:00Z') }),
        event({ id: 'sooner', title: 'Published Sooner', startMs: at('2027-03-18T02:00:00Z') }),
      ],
      { nowMs: fixedNow },
    );
    expect(agenda().getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Published Sooner',
      'Draft Between',
      'Published Later',
    ]);
  });

  it('keeps deleted events off the agenda, drafts included', () => {
    renderBoard([
      event({ id: 'live-one', title: 'Still Here' }),
      event({ id: 'del-draft', title: 'Deleted Draft', lifecycle: 'drafted', deleted: true }),
      event({ id: 'del-pub', title: 'Deleted Published', deleted: true }),
    ]);
    expect(agenda().getByText('Still Here')).toBeInTheDocument();
    expect(agenda().queryByText('Deleted Draft')).toBeNull();
    expect(agenda().queryByText('Deleted Published')).toBeNull();
  });

  it('a filter with no match and nothing hidden shows no Manage pointer', () => {
    renderBoard([event({ id: 'keep', title: 'Keep Me' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Search events' }));
    fireEvent.change(screen.getByLabelText('Search your programme'), { target: { value: 'nothing like this' } });
    expect(agenda().getByText('No events match this filter.')).toBeInTheDocument();
    expect(agenda().queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  it('says the filter matched nothing, not "no upcoming events", when a search finds nothing', () => {
    renderBoard([event({ id: 'keep', title: 'Keep Me' }), event({ id: 'gone', title: 'Gone Event', lifecycle: 'cancelled' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Search events' }));
    fireEvent.change(screen.getByLabelText('Search your programme'), { target: { value: 'nothing like this' } });
    expect(agenda().getByText('No events match this filter.')).toBeInTheDocument();
    expect(agenda().getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/dashboard/manage');
    expect(agenda().queryByText(/No upcoming events/)).toBeNull();
    expect(agenda().queryByRole('link', { name: /create/i })).toBeNull();
  });

  it('points to Manage, and says only cancelled events are there, when the only upcoming events are cancelled', () => {
    renderBoard([event({ id: 'c1', title: 'Cancelled Soon', lifecycle: 'cancelled' })]);
    expect(agenda().getByText('No upcoming events. Create one to start your programme.')).toBeInTheDocument();
    expect(agenda().getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/dashboard/manage');
    expect(agenda().getByText(/^Cancelled events are listed in/)).toBeInTheDocument();
    expect(agenda().queryByText(/draft/i)).toBeNull();
  });

  it('a lone draft is a programme event, not an empty programme', () => {
    renderBoard([event({ id: 'd1', title: 'Draft Soon', lifecycle: 'drafted' })]);
    expect(agenda().getByText('Draft Soon')).toBeInTheDocument();
    expect(agenda().queryByText(/No upcoming events/)).toBeNull();
    expect(agenda().queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  it('a past-dated draft is listed on Programme, so an empty Upcoming view does not send anyone to Manage for it', () => {
    renderBoard([event({ id: 'd-old', title: 'Old Draft', lifecycle: 'drafted', startMs: NOW - 48 * HOUR })]);
    expect(agenda().getByText('No upcoming events. Create one to start your programme.')).toBeInTheDocument();
    expect(agenda().queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  it('shows no Manage pointer when nothing is hidden', () => {
    renderBoard([event({ id: 'p1', title: 'Past One', lifecycle: 'completed', startMs: NOW - 48 * HOUR })]);
    expect(agenda().getByText('No upcoming events. Create one to start your programme.')).toBeInTheDocument();
    expect(agenda().queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  it('excludes cancelled events from the programme agenda, upcoming and past', () => {
    renderBoard([
      event({ id: 'c1', title: 'Cancelled Soon', lifecycle: 'cancelled' }),
      event({ id: 'c2', title: 'Cancelled Before', lifecycle: 'cancelled', startMs: NOW - 48 * HOUR }),
    ]);
    expect(agenda().queryByText('Cancelled Soon')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^past$/i }));
    expect(agenda().queryByText('Cancelled Before')).toBeNull();
  });

  it('renders a "Manage all events" CTA linking to /dashboard/manage', () => {
    renderBoard([event({})]);
    expect(screen.getByRole('link', { name: /manage all events/i })).toHaveAttribute('href', '/dashboard/manage');
  });
});
