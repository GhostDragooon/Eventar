/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PassDeliveryPanel } from './PassDeliveryPanel';
import type { DeliveryLogRow } from '@/lib/delivery/deliveryStatus';

afterEach(cleanup);

const regs = [
  { id: 'r1', full_name: 'Karen Lau' },
  { id: 'r2', full_name: 'Wing Yan Ho' },
];

const log = (registration_id: string, status: DeliveryLogRow['status']): DeliveryLogRow => ({
  registration_id,
  purpose: 'reminder',
  status,
});

describe('PassDeliveryPanel', () => {
  it('renders nothing when the event has no registrations', () => {
    const { container } = render(<PassDeliveryPanel registrations={[]} logRows={[]} windowOpen />);
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms plainly when everyone has their pass', () => {
    render(<PassDeliveryPanel registrations={regs} logRows={[log('r1', 'sent'), log('r2', 'sent')]} windowOpen />);
    expect(screen.getByText(/everyone has their check-in pass/i)).toBeTruthy();
    expect(screen.getByText(/2 of 2 delivered/i)).toBeTruthy();
  });

  // The point of the panel: name the person, because a count is not actionable.
  it('names an attendee the scheduler gave up on, and says what to do about it', () => {
    const gaveUp = [log('r1', 'failed'), log('r1', 'failed'), log('r1', 'failed'), log('r2', 'sent')];
    render(<PassDeliveryPanel registrations={regs} logRows={gaveUp} windowOpen />);

    expect(screen.getByText('Karen Lau')).toBeTruthy();
    expect(screen.getByText(/no pass sent/i)).toBeTruthy();
    // Both the summary and the per-row hint point at the roster — that is the
    // recovery path, and it should be stated in both places.
    expect(screen.getAllByText(/roster/i).length).toBeGreaterThanOrEqual(2);
    // The one who is fine is counted, never listed — a wall of ticks trains
    // people to skim past the row that matters.
    expect(screen.queryByText('Wing Yan Ho')).toBeNull();
  });

  it('does not flag a recipient who is still being retried', () => {
    render(<PassDeliveryPanel registrations={regs} logRows={[log('r1', 'failed'), log('r2', 'sent')]} windowOpen />);
    expect(screen.queryByText('Karen Lau')).toBeNull();
    expect(screen.getByText(/1 retrying/i)).toBeTruthy();
  });

  // Before the reminder window opens, nobody has a pass yet and that is normal.
  // Flagging it there would make the panel cry wolf on every new event.
  it('stays quiet about missing passes before the window opens', () => {
    render(<PassDeliveryPanel registrations={regs} logRows={[]} windowOpen={false} />);
    expect(screen.queryByText(/no usable pass/i)).toBeNull();
    expect(screen.getByText(/passes go out when check-in opens/i)).toBeTruthy();
  });

  it('flags a never-sent pass once the window IS open', () => {
    render(<PassDeliveryPanel registrations={regs} logRows={[log('r2', 'sent')]} windowOpen />);
    expect(screen.getByText('Karen Lau')).toBeTruthy();
    expect(screen.getByText(/not sent yet/i)).toBeTruthy();
  });

  // A queued row is terminal under email_log_dedup_idx — it will never become
  // 'sent', so it must never read as success.
  it('treats a stalled queued row as undelivered, not as sent', () => {
    render(<PassDeliveryPanel registrations={regs} logRows={[log('r1', 'queued'), log('r2', 'sent')]} windowOpen />);
    expect(screen.getByText(/logged, never emailed/i)).toBeTruthy();
    expect(screen.getByText(/1 of 2 delivered/i)).toBeTruthy();
  });

  // Found by backtesting against the real DB: with RESEND_API_KEY unset every
  // row is 'queued' BY DESIGN (the dev stub), so the panel screamed "nobody has
  // a pass" in red on every local run. Same distinction formatSendResult
  // already makes ("logged (dev — not emailed)") and the cron route reports as
  // delivery: 'stubbed'. Alarming where it is expected trains people to ignore
  // the alarm that matters.
  it('does not cry fault over queued rows when email delivery is stubbed', () => {
    render(
      <PassDeliveryPanel
        registrations={regs}
        logRows={[log('r1', 'queued'), log('r2', 'queued')]}
        windowOpen
        deliveryLive={false}
      />,
    );
    expect(screen.queryByText(/no usable pass/i)).toBeNull();
    expect(screen.getByText(/not emailed/i)).toBeTruthy();
  });

  it('still treats queued as a real fault when delivery IS live', () => {
    render(
      <PassDeliveryPanel
        registrations={regs}
        logRows={[log('r1', 'queued'), log('r2', 'sent')]}
        windowOpen
        deliveryLive
      />,
    );
    expect(screen.getByText(/no usable pass/i)).toBeTruthy();
  });
});
