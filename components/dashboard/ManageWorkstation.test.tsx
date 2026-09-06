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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
