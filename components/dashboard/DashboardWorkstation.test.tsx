/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Server actions are no longer imported by DashboardWorkstation (manage moved
// to its own route), but keep the mock in case a transitive import pulls them.
vi.mock('@/app/dashboard/actions', () => ({
  softDeleteEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
  cancelEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
  restoreEvents: vi.fn(async () => ({ ok: true as const, count: 1 })),
}));

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

function event(overrides: Partial<ProgrammeEvent>): ProgrammeEvent {
  return {
    id: 'e-1',
    title: 'Sample Event',
    description: null,
    lifecycle: 'registering',
    startMs: NOW + 24 * HOUR,
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

function renderBoard(events: ProgrammeEvent[], opts: { nowMs?: number } = {}) {
  return render(
    <ToastProvider>
      <DashboardWorkstation
        events={events}
        attention={[]}
        metrics={metrics}
        orgName="Test Org"
        nowMs={opts.nowMs ?? NOW}
      />
    </ToastProvider>,
  );
}

function agenda() {
  return within(screen.getByTestId('agenda'));
}

describe('DashboardWorkstation — programme home', () => {
  it('defaults to card view and persists the toggle to localStorage', () => {
    renderBoard([event({})]);
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Compact view' }));
    expect(localStorage.getItem('eventar.programme.view')).toBe('compact');
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an agenda row opens the ExpandableEventCard dialog', () => {
    renderBoard([event({ id: 'e-open', title: 'Open Me' })]);
    fireEvent.click(agenda().getByText('Open Me'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  it('excludes drafts from the programme agenda', () => {
    renderBoard([event({ id: 'd1', title: 'Draft Event', lifecycle: 'drafted' })]);
    expect(agenda().queryByText('Draft Event')).toBeNull();
  });

  it('renders a "Manage all events" CTA linking to /dashboard/manage', () => {
    renderBoard([event({})]);
    expect(screen.getByRole('link', { name: /manage all events/i })).toHaveAttribute('href', '/dashboard/manage');
  });
});
