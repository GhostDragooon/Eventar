/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AttendanceSection, type CheckInRecord } from './AttendanceSection';

// vitest.config has no `globals: true` — explicit cleanup keeps jsdom rooted.
afterEach(cleanup);

const startTime = '2026-06-15T09:00:00Z';
const endTime = '2026-06-15T12:00:00Z';
const doorOpenMs = Date.parse(startTime) - 60 * 60_000;

const baseProps = {
  eventId: 'e1',
  registered: 10,
  attended: 0,
  checkIns: [] as CheckInRecord[],
  startTime,
  endTime,
  timezone: 'UTC',
  nowMs: Date.parse(startTime) + 30 * 60_000, // mid-event
};

describe('AttendanceSection — pending one-line stub', () => {
  it('collapses to a stub with a to-door countdown before the door opens', () => {
    const { getByText, queryByText } = render(
      <AttendanceSection
        {...baseProps}
        lifecycle="registering"
        nowMs={doorOpenMs - (2 * 86_400_000 + 14 * 3_600_000)} // 2d 14h before door
      />,
    );
    expect(getByText(/opens 15 Jun/)).toBeInTheDocument();
    expect(getByText(/2d 14h to door/)).toBeInTheDocument();
    // No histogram / roster affordances while pending.
    expect(queryByText(/Arrivals per/)).toBeNull();
    expect(queryByText(/Open roster/)).toBeNull();
  });
});

describe('AttendanceSection — live operator view', () => {
  const checkIns: CheckInRecord[] = [
    { at: new Date(doorOpenMs + 5 * 60_000).toISOString(), method: 'qr' },
    { at: new Date(doorOpenMs + 6 * 60_000).toISOString(), method: 'qr' },
    { at: new Date(doorOpenMs + 12 * 60_000).toISOString(), method: 'manual' },
    { at: null, method: null },
  ];

  it('shows the checked-in split (total / QR self-scan / manual reception)', () => {
    const { getByText } = render(
      <AttendanceSection {...baseProps} lifecycle="live" attended={3} checkIns={checkIns} />,
    );
    expect(getByText('Checked in')).toBeInTheDocument();
    expect(getByText('Self-scan')).toBeInTheDocument();
    expect(getByText('Reception')).toBeInTheDocument();
    expect(getByText(/Live · 3 of 10 checked in/)).toBeInTheDocument();
  });

  it('renders the arrivals histogram with a peak label', () => {
    const { getByText } = render(
      <AttendanceSection {...baseProps} lifecycle="live" attended={3} checkIns={checkIns} />,
    );
    expect(getByText(/Arrivals per 5 min/)).toBeInTheDocument();
    expect(getByText(/peak .* · 2 arrivals/)).toBeInTheDocument();
  });

  it('offers Open roster while live', () => {
    const { getByRole } = render(
      <AttendanceSection {...baseProps} lifecycle="live" attended={3} checkIns={checkIns} />,
    );
    expect(getByRole('link', { name: /open roster/i })).toHaveAttribute('href', '/events/e1/checkin');
  });
});

describe('AttendanceSection — completed wrap-up', () => {
  it('shows show-up rate + funnel and no roster CTA', () => {
    const { getByText, queryByRole } = render(
      <AttendanceSection
        {...baseProps}
        lifecycle="completed"
        attended={6}
        nowMs={Date.parse(endTime) + 3_600_000}
        checkIns={[{ at: new Date(doorOpenMs + 60_000).toISOString(), method: 'qr' }]}
      />,
    );
    expect(getByText('Show-up rate')).toBeInTheDocument();
    expect(getByText('10 → 6')).toBeInTheDocument();
    expect(queryByRole('link', { name: /open roster/i })).toBeNull();
  });
});
