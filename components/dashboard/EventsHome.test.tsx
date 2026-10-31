/** @vitest-environment jsdom */
import { vi } from 'vitest';

const { softDeleteMock, cancelMock, restoreMock } = vi.hoisted(() => ({
  softDeleteMock: vi.fn(async (_ids: string[]) => ({ ok: true as const, count: 1 })),
  cancelMock: vi.fn(async (_ids: string[]) => ({ ok: true as const, count: 1 })),
  restoreMock: vi.fn(async (_ids: string[]) => ({ ok: true as const, count: 1 })),
}));
vi.mock('@/app/dashboard/actions', () => ({
  softDeleteEvents: softDeleteMock,
  cancelEvents: cancelMock,
  restoreEvents: restoreMock,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/toast';
import { EventsHome } from './EventsHome';
import type { ProgrammeEvent } from './DashboardWorkstation';

afterEach(cleanup);
beforeEach(() => {
  softDeleteMock.mockClear();
  cancelMock.mockClear();
  restoreMock.mockClear();
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
    dayKey: '2026-07-04',
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
    createdBy: 'staff-1',
    hosts: [],
    ...overrides,
  };
}

const VIEWER = { id: 'staff-1', role: 'organiser_member' };

function renderManage(events: ProgrammeEvent[], viewer = VIEWER, extra: { initialTab?: 'active' | 'drafts' | 'cancelled' | 'deleted' } = {}) {
  return render(
    <ToastProvider>
      <EventsHome events={events} viewer={viewer} nowMs={NOW} {...extra} />
    </ToastProvider>,
  );
}

describe('EventsHome', () => {
  it('is titled Events, says where finished events went, and offers New event (CX-04R)', () => {
    renderManage([event({ id: 'e-1' })]);
    const title = screen.getByRole('heading', { level: 1, name: 'Events' });
    expect(within(title.closest('header')!).getByText('1 event. Finished events are in History.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new event/i })).toHaveAttribute('href', '/events/new');
    expect(document.body.textContent).not.toMatch(/Programme|Manage/);
  });

  describe('per-row action links', () => {
    it('renders Details, Edit and Check-in, and no per-card Delete', () => {
      renderManage([event({ id: 'e-7' })]);
      expect(screen.getByRole('link', { name: /^details$/i })).toHaveAttribute('href', '/events/e-7/details');
      expect(screen.getByRole('link', { name: /^edit$/i })).toHaveAttribute('href', '/events/e-7/edit');
      expect(screen.getByRole('link', { name: /^check-in$/i })).toHaveAttribute('href', '/events/e-7/checkin');
      expect(screen.queryByRole('link', { name: /analytics/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    });
  });

  describe('state tabs', () => {
    const mixed = [
      event({ id: 'a1', title: 'Open One' }),
      event({ id: 'a2', title: 'Live One', lifecycle: 'live' }),
      event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' }),
      event({ id: 'c1', title: 'Called Off', lifecycle: 'cancelled' }),
      event({ id: 'h1', title: 'Finished One', lifecycle: 'completed' }),
      event({ id: 'x1', title: 'Binned One', deleted: true }),
    ];

    it('counts Active, Drafts, Cancelled and Deleted; completed events belong to no tab', () => {
      renderManage(mixed);
      const tabs = within(screen.getByRole('tablist', { name: 'Event state' }));
      expect(tabs.getByRole('tab', { name: /^Active\s*2$/ })).toHaveAttribute('aria-selected', 'true');
      expect(tabs.getByRole('tab', { name: /^Drafts\s*1$/ })).toBeInTheDocument();
      expect(tabs.getByRole('tab', { name: /^Cancelled\s*1$/ })).toBeInTheDocument();
      expect(tabs.getByRole('tab', { name: /^Deleted\s*1$/ })).toBeInTheDocument();
      expect(screen.queryByText('Finished One')).toBeNull();
      fireEvent.click(screen.getByRole('tab', { name: /^Drafts/ }));
      expect(screen.queryByText('Finished One')).toBeNull();
    });

    it('a draft is findable under Drafts, not under Active', () => {
      renderManage(mixed);
      expect(screen.queryByText('Draft One')).toBeNull();
      fireEvent.click(screen.getByRole('tab', { name: /^Drafts/ }));
      expect(screen.getByText('Draft One')).toBeInTheDocument();
      expect(screen.queryByText('Open One')).toBeNull();
    });

    it('hides the Deleted tab while nothing is deleted', () => {
      renderManage([event({ id: 'a1' })]);
      expect(screen.queryByRole('tab', { name: /^Deleted/ })).toBeNull();
    });

    it('a draft whose date has passed says so', () => {
      renderManage([event({ id: 'd1', title: 'Old Draft', lifecycle: 'drafted', startMs: NOW - 48 * HOUR })]);
      fireEvent.click(screen.getByRole('tab', { name: /^Drafts/ }));
      expect(screen.getByText('The date has passed. Edit the date to publish this draft.')).toBeInTheDocument();
    });

    it('Cancel is offered on Active only (not on Drafts)', () => {
      renderManage([event({ id: 'a1', title: 'Open One' }), event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' })]);
      fireEvent.click(screen.getByLabelText('Select Open One'));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: /^Drafts/ }));
      fireEvent.click(screen.getByLabelText('Select Draft One'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('the Deleted tab offers Restore for a row and for the selection', async () => {
      renderManage([event({ id: 'x1', title: 'Binned One', deleted: true })]);
      fireEvent.click(screen.getByRole('tab', { name: /^Deleted/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
      await waitFor(() => expect(restoreMock).toHaveBeenCalledWith(['x1']));
    });
  });

  describe('the tab follows the address (Ivan 2026-11-01: open the tab and keep the URL in sync)', () => {
    const rows = [
      event({ id: 'a1', title: 'Open One' }),
      event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' }),
    ];
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('opens the tab a link asked for', () => {
      renderManage(rows, VIEWER, { initialTab: 'drafts' });
      expect(screen.getByRole('tab', { name: /^Drafts/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Draft One')).toBeInTheDocument();
      expect(screen.queryByText('Open One')).toBeNull();
    });

    it('writes ?tab= when a tab is clicked and drops it for Active', () => {
      renderManage(rows);
      fireEvent.click(screen.getByRole('tab', { name: /^Drafts/ }));
      expect(window.location.search).toBe('?tab=drafts');
      fireEvent.click(screen.getByRole('tab', { name: /^Active/ }));
      expect(window.location.search).toBe('');
    });

    it('falls back to Active when the asked-for Deleted tab is empty, instead of showing a tab that is not there', () => {
      renderManage(rows, VIEWER, { initialTab: 'deleted' });
      expect(screen.getByRole('tab', { name: /^Active/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Open One')).toBeInTheDocument();
    });
  });

  describe('drafts and dates', () => {
    it('a draft offers Details and Edit but no Check-in (check-in is refused until it is published)', () => {
      renderManage([event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' })], VIEWER, { initialTab: 'drafts' });
      expect(screen.getByRole('link', { name: /^details$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^check-in$/i })).toBeNull();
    });

    it('the date block names the month, and the year only when it is not this year', () => {
      const thisYear = new Date(NOW).getUTCFullYear();
      renderManage([
        event({ id: 'a1', title: 'Same Year', dayKey: `${thisYear}-11-14`, dateLabel: 'Sat 14 Nov' }),
        event({ id: 'a2', title: 'Next Year', dayKey: `${thisYear + 1}-03-02`, dateLabel: 'Tue 2 Mar' }),
      ]);
      const same = within(screen.getByText('Same Year').closest('li')!);
      expect(same.getByText('Sat Nov')).toBeInTheDocument();
      expect(same.queryByText(String(thisYear))).toBeNull();
      const next = within(screen.getByText('Next Year').closest('li')!);
      expect(next.getByText('Tue Mar')).toBeInTheDocument();
      expect(next.getByText(String(thisYear + 1))).toBeInTheDocument();
    });
  });

  describe('selection follows what is on screen', () => {
    it('a ticked row hidden by a search is not part of the bulk action or the count', () => {
      renderManage([event({ id: 'a1', title: 'Alpha' }), event({ id: 'b1', title: 'Bravo' })]);
      fireEvent.click(screen.getByLabelText('Select Alpha'));
      fireEvent.click(screen.getByLabelText('Select Bravo'));
      expect(screen.getByText('2 selected')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'bravo' } });
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('Delete 1 event?');
      fireEvent.click(screen.getByRole('button', { name: 'Delete 1 event' }));
      expect(softDeleteMock).toHaveBeenCalledWith(['b1']);
    });
  });

  describe('tick box only on events the viewer created', () => {
    const rows = [
      event({ id: 'mine', title: 'My Event', createdBy: 'staff-1' }),
      event({ id: 'theirs', title: 'Their Event', createdBy: 'staff-2' }),
    ];

    it('shows a tick box on own events and none on a colleague\'s, which says who it belongs to', () => {
      renderManage(rows);
      expect(screen.getByLabelText('Select My Event')).toBeInTheDocument();
      expect(screen.queryByLabelText('Select Their Event')).toBeNull();
      expect(within(screen.getByText('Their Event').closest('li')!).getByText('Created by a colleague')).toBeInTheDocument();
    });

    it('eventar_staff can tick every event', () => {
      renderManage(rows, { id: 'staff-9', role: 'eventar_staff' });
      expect(screen.getByLabelText('Select My Event')).toBeInTheDocument();
      expect(screen.getByLabelText('Select Their Event')).toBeInTheDocument();
    });
  });

  describe('delete flow (tick, bulk Delete, dialog, action, toast)', () => {
    function tickAndDelete(title = 'Sample Event') {
      fireEvent.click(screen.getByLabelText(`Select ${title}`));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    }

    it('bulk Delete opens the designed dialog instead of window.confirm', () => {
      renderManage([event({ id: 'e-1', title: 'Sample Event' })]);
      tickAndDelete();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Delete 1 event?');
      expect(dialog).toHaveTextContent('Deleted bucket');
      expect(softDeleteMock).not.toHaveBeenCalled();
    });

    it('cancelling the dialog runs nothing', () => {
      renderManage([event({})]);
      tickAndDelete('Sample Event');
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(softDeleteMock).not.toHaveBeenCalled();
    });

    it('confirming runs the soft delete and surfaces a success toast', async () => {
      renderManage([event({ id: 'e-9' })]);
      tickAndDelete('Sample Event');
      fireEvent.click(screen.getByRole('button', { name: 'Delete 1 event' }));
      await waitFor(() => expect(softDeleteMock).toHaveBeenCalledWith(['e-9']));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/moved to Deleted/),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('an action error is surfaced as an error toast (never silent)', async () => {
      softDeleteMock.mockResolvedValueOnce({ error: 'Could not update the selected events.' } as never);
      renderManage([event({})]);
      tickAndDelete('Sample Event');
      fireEvent.click(screen.getByRole('button', { name: 'Delete 1 event' }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Could not update the selected events.'),
      );
    });
  });

  describe('live-first ordering', () => {
    it('pins live events to the top of the Active list regardless of sort', () => {
      renderManage([
        event({ id: 'a', title: 'Alpha Soonest', startMs: NOW + 1 * HOUR }),
        event({ id: 'b', title: 'Bravo Live', lifecycle: 'live', startMs: NOW + 48 * HOUR }),
      ]);
      const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
      expect(titles[0]).toContain('Bravo Live');
      expect(titles[1]).toContain('Alpha Soonest');
    });
  });

  describe('cancel with a 7-second undo', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function confirmCancel() {
      renderManage([event({ id: 'c-1', title: 'Cancel Me' })]);
      fireEvent.click(screen.getByLabelText('Select Cancel Me'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel 1 event' }));
    }
    function tick(seconds: number) {
      for (let i = 0; i < seconds; i++) act(() => { vi.advanceTimersByTime(1000); });
    }

    it('the first dialog offers "Keep events", not an ambiguous "Cancel"', () => {
      renderManage([event({ id: 'c-1', title: 'Cancel Me' })]);
      fireEvent.click(screen.getByLabelText('Select Cancel Me'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Keep events' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel 1 event' })).toBeInTheDocument();
    });

    it('shows "Moved to the Cancelled tab" and writes nothing until the countdown ends', () => {
      confirmCancel();
      expect(screen.getByText('Moved to the Cancelled tab')).toBeInTheDocument();
      expect(screen.getByText('Registrants keep their records. You have 7 seconds to undo.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo (7)' })).toBeInTheDocument();
      tick(6);
      expect(screen.getByRole('button', { name: 'Undo (1)' })).toBeInTheDocument();
      expect(cancelMock).not.toHaveBeenCalled();
      tick(1);
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(['c-1']);
    });

    it('Undo closes the dialog and never writes', () => {
      confirmCancel();
      tick(3);
      fireEvent.click(screen.getByRole('button', { name: 'Undo (4)' }));
      expect(screen.getByText('Undone. Nothing was cancelled.')).toBeInTheDocument();
      tick(10);
      expect(screen.queryByText('Moved to the Cancelled tab')).toBeNull();
      cleanup();
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('Escape undoes with the same toast; a backdrop click does nothing', () => {
      confirmCancel();
      fireEvent.click(screen.getByRole('dialog').firstElementChild!);
      expect(screen.getByText('Moved to the Cancelled tab')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Moved to the Cancelled tab')).toBeNull();
      expect(screen.getByText('Undone. Nothing was cancelled.')).toBeInTheDocument();
      tick(10);
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('locks the bulk and card actions while counting down', () => {
      confirmCancel();
      for (const b of screen.getAllByRole('button', { name: /^(Delete|Cancel|Clear)$/ })) expect(b).toBeDisabled();
    });

    it('sends at once when the page is hidden (phone locked, tab switched)', () => {
      confirmCancel();
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      hidden.mockRestore();
      expect(cancelMock).toHaveBeenCalledWith(['c-1']);
    });

    it('a failed cancel is surfaced as an error toast', async () => {
      cancelMock.mockResolvedValueOnce({ error: 'Could not update the selected events.' } as never);
      confirmCancel();
      tick(1);
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      await act(async () => {});
      expect(screen.getByText('Could not update the selected events.')).toBeInTheDocument();
    });

    it('ignores a click on Done in its first 500 ms (a double-click on the first dialog)', () => {
      confirmCancel();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(cancelMock).not.toHaveBeenCalled();
      expect(screen.getByText('Moved to the Cancelled tab')).toBeInTheDocument();
    });

    it('does not offer Cancel on the Cancelled tab', () => {
      vi.useRealTimers();
      renderManage([event({ id: 'x-1', title: 'Already Off', lifecycle: 'cancelled' })]);
      fireEvent.click(screen.getByRole('tab', { name: /^Cancelled/ }));
      fireEvent.click(screen.getByLabelText('Select Already Off'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('sends the cancel if the page unmounts mid-countdown, so it is never silently dropped', () => {
      confirmCancel();
      tick(2);
      cleanup();
      expect(cancelMock).toHaveBeenCalledWith(['c-1']);
    });

    it('warns before the tab closes while counting down', () => {
      confirmCancel();
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('Done writes at once, and only once', () => {
      confirmCancel();
      tick(1);
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(cancelMock).toHaveBeenCalledTimes(1);
      tick(10);
      expect(cancelMock).toHaveBeenCalledTimes(1);
    });
  });

  // A tick and a visibility change can both fire before React re-renders, so
  // "already sent" must not depend on rendered state. Slow server: the send
  // never resolves, the dialog stays in its sent state.
  describe('cancel undo, events landing before a re-render', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      cancelMock.mockImplementation(() => new Promise(() => {}));
    });
    afterEach(() => {
      vi.useRealTimers();
      cancelMock.mockImplementation(async () => ({ ok: true as const, count: 1 }));
    });

    function start() {
      renderManage([event({ id: 'c-1', title: 'Cancel Me' })]);
      fireEvent.click(screen.getByLabelText('Select Cancel Me'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel 1 event' }));
    }
    const tick = (n: number) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(1000); }); };
    const flush = () => act(async () => { await new Promise((r) => setImmediate(r)); });
    function hide() {
      const s = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      s.mockRestore();
    }

    it('last tick then page hidden sends once', async () => {
      start(); tick(6);
      vi.advanceTimersByTime(1000);
      hide();
      await flush();
      expect(cancelMock).toHaveBeenCalledTimes(1);
    });

    it('page hidden then a due tick does not restart the countdown or let Escape claim an undo', async () => {
      start(); tick(4);
      hide();
      vi.advanceTimersByTime(1000);
      await flush();
      expect(screen.queryByRole('button', { name: /^Undo \(/ })).toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Undone. Nothing was cancelled.')).toBeNull();
      tick(3);
      expect(cancelMock).toHaveBeenCalledTimes(1);
    });
  });
});
