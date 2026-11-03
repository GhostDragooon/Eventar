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
import type { ProgrammeEvent } from './programmeEvent';

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
    hosts: [],
    ...overrides,
  };
}

function renderManage(events: ProgrammeEvent[], extra: { initialTab?: 'active' | 'drafts' | 'cancelled' | 'deleted' } = {}) {
  return render(
    <ToastProvider>
      <EventsHome events={events} nowMs={NOW} {...extra} />
    </ToastProvider>,
  );
}

describe('EventsHome', () => {
  it('is titled Events, says where finished events went, and offers New event (CX-04R)', () => {
    renderManage([event({ id: 'e-1' })]);
    const title = screen.getByRole('heading', { level: 1, name: 'Events' });
    const header = within(title.closest('header')!);
    expect(header.getByText(/^1 active event\. Finished events are in/)).toBeInTheDocument();
    expect(header.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/analytics');
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
      const tabs = within(screen.getByRole('group', { name: 'Filter events by state' }));
      expect(tabs.getByRole('button', { name: /^Active,\s*2$/ })).toHaveAttribute('aria-pressed', 'true');
      expect(tabs.getByRole('button', { name: /^Drafts,\s*1$/ })).toBeInTheDocument();
      expect(tabs.getByRole('button', { name: /^Cancelled,\s*1$/ })).toBeInTheDocument();
      expect(tabs.getByRole('button', { name: /^Deleted,\s*1$/ })).toBeInTheDocument();
      expect(screen.queryByText('Finished One')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      expect(screen.queryByText('Finished One')).toBeNull();
    });

    it('a draft is findable under Drafts, not under Active', () => {
      renderManage(mixed);
      expect(screen.queryByText('Draft One')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      expect(screen.getByText('Draft One')).toBeInTheDocument();
      expect(screen.queryByText('Open One')).toBeNull();
    });

    it('hides the Deleted tab while nothing is deleted', () => {
      renderManage([event({ id: 'a1' })]);
      expect(screen.queryByRole('button', { name: /^Deleted/ })).toBeNull();
    });

    it('a draft whose date has passed says so', () => {
      renderManage([event({ id: 'd1', title: 'Old Draft', lifecycle: 'drafted', startMs: NOW - 48 * HOUR })]);
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      expect(screen.getByText('The date has passed. Edit the date to publish this draft.')).toBeInTheDocument();
    });

    it('Cancel is offered on Active only (not on Drafts)', () => {
      renderManage([event({ id: 'a1', title: 'Open One' }), event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' })]);
      fireEvent.click(screen.getByLabelText('Select Open One'));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      fireEvent.click(screen.getByLabelText('Select Draft One'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('labels a draft "Draft" and a deleted event "Deleted", never "Drafted" (acceptance walk MAJOR #1)', () => {
      renderManage(mixed);
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.queryByText('Drafted')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /^Deleted/ }));
      const row = screen.getByText('Binned One').closest('li') as HTMLElement;
      expect(within(row).getByText('Deleted')).toBeInTheDocument();
      expect(within(row).queryByText(/draft/i)).toBeNull();
    });

    it('the header counts what is on the Active tab, not every tab (acceptance walk MAJOR #2)', () => {
      renderManage(mixed);
      const tabs = within(screen.getByRole('group', { name: 'Filter events by state' }));
      expect(tabs.getByRole('button', { name: /^Active,\s*2$/ })).toBeInTheDocument();
      expect(screen.getByText(/^2 active events\./)).toBeInTheDocument();
      expect(screen.queryByText(/^4 events\./)).toBeNull();
    });

    it('the Deleted tab offers Restore for a row and for the selection', async () => {
      renderManage([event({ id: 'x1', title: 'Binned One', deleted: true })]);
      fireEvent.click(screen.getByRole('button', { name: /^Deleted/ }));
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
      renderManage(rows, { initialTab: 'drafts' });
      expect(screen.getByRole('button', { name: /^Drafts/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Draft One')).toBeInTheDocument();
      expect(screen.queryByText('Open One')).toBeNull();
    });

    it('writes ?tab= when a tab is clicked and drops it for Active', () => {
      renderManage(rows);
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      expect(window.location.search).toBe('?tab=drafts');
      fireEvent.click(screen.getByRole('button', { name: /^Active/ }));
      expect(window.location.search).toBe('');
    });

    it('falls back to Active when the asked-for Deleted tab is empty, instead of showing a tab that is not there', () => {
      renderManage(rows, { initialTab: 'deleted' });
      expect(screen.getByRole('button', { name: /^Active/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Open One')).toBeInTheDocument();
    });
  });

  describe('drafts and dates', () => {
    it('a draft offers Details and Edit but no Check-in (check-in is refused until it is published)', () => {
      renderManage([event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' })], { initialTab: 'drafts' });
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
      expect(screen.getByRole('dialog')).toHaveTextContent('Delete "Bravo"?');
      fireEvent.click(screen.getByRole('button', { name: 'Delete 1 event' }));
      expect(softDeleteMock).toHaveBeenCalledWith(['b1']);
    });
  });

  describe('tick box on every event in the organisation (Ivan 2026-11-01: the server allows it, so the page does)', () => {
    it('shows a tick box on every row, whoever created it', () => {
      renderManage([event({ id: 'mine', title: 'My Event' }), event({ id: 'theirs', title: 'Their Event' })]);
      expect(screen.getByLabelText('Select My Event')).toBeInTheDocument();
      expect(screen.getByLabelText('Select Their Event')).toBeInTheDocument();
      expect(screen.queryByText(/created by/i)).toBeNull();
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
      expect(dialog).toHaveTextContent('Delete "Sample Event"?');
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

  describe('what the page says about itself (follow-ups 1 to 4 and 6, 2026-11-01)', () => {
    it('a cancelled event offers Details and Edit but no Check-in (the desk is closed for it)', () => {
      renderManage([event({ id: 'x1', title: 'Called Off', lifecycle: 'cancelled' })], { initialTab: 'cancelled' });
      expect(screen.getByRole('link', { name: /^details$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^check-in$/i })).toBeNull();
    });

    it('an empty search names the tab it searched', () => {
      renderManage([event({ id: 'a1', title: 'Alpha' }), event({ id: 'd1', title: 'Draft One', lifecycle: 'drafted' })]);
      fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
      fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'zzz' } });
      expect(screen.getByText('Nothing in Drafts matches this search.')).toBeInTheDocument();
    });

    it('the Cancel dialog says nobody is emailed and names the event', () => {
      renderManage([event({ id: 'c-1', title: 'Cancel Me' })]);
      fireEvent.click(screen.getByLabelText('Select Cancel Me'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Cancel "Cancel Me"?');
      expect(dialog).toHaveTextContent('nobody is emailed');
    });

    it('several events are counted, not named', () => {
      renderManage([event({ id: 'a1', title: 'Alpha' }), event({ id: 'b1', title: 'Bravo' })]);
      fireEvent.click(screen.getByLabelText('Select Alpha'));
      fireEvent.click(screen.getByLabelText('Select Bravo'));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('Delete 2 events?');
    });

    it('says when the list stopped at 300 events, and points at History', () => {
      renderManage(Array.from({ length: 300 }, (_, i) => event({ id: `e-${i}`, title: `Event ${i}` })));
      expect(screen.getByText(/Only the 300 events with the latest dates are loaded, so older ones may be missing here\. Finished events are in History\./)).toBeInTheDocument();
    });

    it('says nothing about a cap under 300', () => {
      renderManage([event({ id: 'e-1' })]);
      expect(screen.queryByText(/Only the 300/)).toBeNull();
    });
  });

  describe('Export CSV keeps spreadsheet formulas out of titles', () => {
    afterEach(() => vi.restoreAllMocks());

    async function exportedCsv(events: ProgrammeEvent[], ticks: string[]) {
      let blob: Blob | undefined;
      URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; });
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderManage(events);
      for (const t of ticks) fireEvent.click(screen.getByLabelText(`Select ${t}`));
      fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
      return await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.readAsText(blob!);
      });
    }

    it.each(['=HYPERLINK("http://x","y")', '+852 mixer', '-1 night', '@cmd'])('prefixes %s with an apostrophe', async (title) => {
      const csv = await exportedCsv([event({ id: 'f1', title })], [title]);
      const row = csv.split('\n')[1];
      expect(row.replace(/^"/, '').startsWith(`'${title.slice(0, 1)}`)).toBe(true);
    });

    it('leaves an ordinary title alone and still quotes commas', async () => {
      const csv = await exportedCsv([event({ id: 'f2', title: 'Plain, with comma' })], ['Plain, with comma']);
      expect(csv.split('\n')[1].startsWith('"Plain, with comma",')).toBe(true);
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
      fireEvent.click(screen.getByRole('button', { name: /^Cancelled/ }));
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
