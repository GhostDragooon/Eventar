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
import { ManageWorkstation } from './ManageWorkstation';
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

function renderManage(events: ProgrammeEvent[]) {
  return render(
    <ToastProvider>
      <ManageWorkstation events={events} />
    </ToastProvider>,
  );
}

describe('ManageWorkstation', () => {
  it('says what the page is for, in the header under the title (CX-04)', () => {
    renderManage([event({ id: 'e-1' })]);
    const title = screen.getByRole('heading', { level: 1, name: 'Manage events' });
    expect(within(title.closest('header')!).getByText('Every event in every state, with search, filters and bulk actions.')).toBeInTheDocument();
  });

  describe('per-row action links', () => {
    it('renders Details, Edit, Door, Analytics, and Delete for each event', () => {
      renderManage([event({ id: 'e-7' })]);
      expect(screen.getByRole('link', { name: /details/i })).toHaveAttribute('href', '/events/e-7/details');
      expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', '/events/e-7/edit');
      expect(screen.getByRole('link', { name: /check-in/i })).toHaveAttribute('href', '/events/e-7/checkin');
      expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute('href', '/events/e-7/analytics');
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });
  });

  describe('delete flow (dialog → action → toast)', () => {
    it('card Delete opens the designed dialog instead of window.confirm', () => {
      renderManage([event({ id: 'e-1', title: 'Sample Event' })]);
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Delete "Sample Event"?');
      expect(dialog).toHaveTextContent('Deleted bucket');
      expect(softDeleteMock).not.toHaveBeenCalled();
    });

    it('cancelling the dialog runs nothing', () => {
      renderManage([event({})]);
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(softDeleteMock).not.toHaveBeenCalled();
    });

    it('confirming runs the soft delete and surfaces a success toast', async () => {
      renderManage([event({ id: 'e-9' })]);
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
      await waitFor(() => expect(softDeleteMock).toHaveBeenCalledWith(['e-9']));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/moved to Deleted/),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('an action error is surfaced as an error toast (never silent)', async () => {
      softDeleteMock.mockResolvedValueOnce({ error: 'Could not update the selected events.' } as never);
      renderManage([event({})]);
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Could not update the selected events.'),
      );
    });
  });

  describe('live-first ordering', () => {
    it('pins live events to the top of the All list regardless of sort', () => {
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

    it('cancels only the selected events that are not already cancelled', () => {
      vi.useRealTimers();
      renderManage([
        event({ id: 'live-1', title: 'Still On' }),
        event({ id: 'off-1', title: 'Already Off', lifecycle: 'cancelled' }),
      ]);
      fireEvent.click(screen.getByLabelText('Select Still On'));
      fireEvent.click(screen.getByLabelText('Select Already Off'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Cancel 1 event' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel 1 event' }));
      cleanup();
      expect(cancelMock).toHaveBeenCalledWith(['live-1']);
    });

    it('says so, and opens nothing, when every selected event is already cancelled', () => {
      vi.useRealTimers();
      renderManage([event({ id: 'off-1', title: 'Already Off', lifecycle: 'cancelled' })]);
      fireEvent.click(screen.getByLabelText('Select Already Off'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText('The selected events are already cancelled.')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
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
