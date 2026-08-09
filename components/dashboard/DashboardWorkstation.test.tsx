/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Server actions module pulls 'use server' internals — mock the surface the
// workstation calls so the dialog → action → toast flow is testable.
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
import { DashboardWorkstation, type WorkstationEvent } from './DashboardWorkstation';

afterEach(cleanup);
beforeEach(() => {
  softDeleteMock.mockClear();
});

const HOUR = 3_600_000;
function event(overrides: Partial<WorkstationEvent>): WorkstationEvent {
  return {
    id: 'e-1',
    title: 'Sample Event',
    description: null,
    lifecycle: 'registering',
    startMs: Date.now() + 24 * HOUR,
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
    ...overrides,
  };
}

const metrics = {
  openRegistered: 10, registered7d: 2, eventsThisWeek: 1, closingSoon: 1,
  // IA-spec stat row (2026-08-09): capture rate + the CPD credits pulse.
  checkedInToday: 4, captureRate: 80, creditsIssued: 12, creditsBlocked: 0, liveNow: 1,
};

function renderBoard(events: WorkstationEvent[]) {
  return render(
    <ToastProvider>
      <DashboardWorkstation events={events} greetingName="Ivan" greeting="evening" metrics={metrics} />
    </ToastProvider>,
  );
}

describe('DashboardWorkstation — delete flow (dialog → action → toast)', () => {
  it('card Delete opens the designed dialog instead of window.confirm', () => {
    renderBoard([event({ id: 'e-1', title: 'Sample Event' })]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete “Sample Event”?');
    expect(dialog).toHaveTextContent('Deleted bucket');
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('cancelling the dialog runs nothing', () => {
    renderBoard([event({})]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('confirming runs the soft delete and surfaces a success toast', async () => {
    renderBoard([event({ id: 'e-9' })]);
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
    renderBoard([event({})]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not update the selected events.'),
    );
  });
});

describe('DashboardWorkstation — live-first ordering', () => {
  it('pins live events to the top of the All list regardless of sort', () => {
    renderBoard([
      event({ id: 'a', title: 'Alpha Soonest', startMs: Date.now() + 1 * HOUR }),
      event({ id: 'b', title: 'Bravo Live', lifecycle: 'live', startMs: Date.now() + 48 * HOUR }),
    ]);
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(titles[0]).toContain('Bravo Live');
    expect(titles[1]).toContain('Alpha Soonest');
  });
});
