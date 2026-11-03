/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';

// DB-02: the desk's controls follow a ticking clock. Everything that crosses a boundary is stubbed; the unit
// under test is "the Check in button, the scan button and the note change when the clock crosses the pre-open".
vi.mock('@/lib/supabase/browser', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabaseBrowser: () => ({ channel: () => channel, removeChannel: () => {} }) };
});
vi.mock('@/lib/doorSession', () => ({ checkDoorSession: vi.fn(async () => ({ ok: true })) }));
vi.mock('./actions', () => ({
  markAttended: vi.fn(async () => ({ error: 'unused' })),
  walkInRegisterAndCheckIn: vi.fn(async () => ({ error: 'unused' })),
}));
// A probe: the desk must hand the Speakers card the same role answer it gives every other control.
vi.mock('./SpeakersCard', () => ({
  SpeakersCard: ({ canCheckIn }: { canCheckIn?: boolean }) => <span data-testid="speakers-probe" data-can-check-in={String(canCheckIn)} />,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import RosterClient from './RosterClient';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// 2026-10-24 06:00 local: far from any day boundary in the zone that matters here (the clock is pinned, so the
// result does not depend on when the suite runs).
const T0 = new Date(2026, 9, 24, 6, 0, 0).getTime();
const min = (m: number) => new Date(T0 + m * 60_000).toISOString();

function renderDesk(startInMin: number, serverNowMs = T0, canCheckIn = true, rowOverride: Record<string, unknown> = {}, eligibilityUnavailable = false) {
  return render(
    <RosterClient
      serverNowMs={serverNowMs}
      canCheckIn={canCheckIn}
      eventId="evt-1"
      eventTimezone="Asia/Hong_Kong"
      eventStartTime={min(startInMin)}
      eventEndTime={min(startInMin + 120)}
      lifecycleRow={{
        status: 'published',
        start_time: min(startInMin),
        end_time: min(startInMin + 120),
        registration_close_at: null,
        registration_open_at: null,
      }}
      initialRoster={[
        { id: 'r1', full_name: 'Ada Lovelace', email: 'ada@x.test', registration_code: 'WK-AAAAAA', status: 'registered', check_in_at: null, check_in_method: null, ...rowOverride },
      ]}
      eligibility={{}}
      eligibilityUnavailable={eligibilityUnavailable}
      maxAttendees={null}
      speakerNames={[]}
      initialSpeakerCheckins={[]}
    />,
  );
}

describe('RosterClient: the eligibility-unavailable notice', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: T0 });
  });

  it('shows for a role that checks people in', () => {
    renderDesk(-30, T0, true, {}, true);
    expect(screen.getByText(/CPD eligibility couldn.t be checked/i)).toBeTruthy();
  });

  // event_registration_eligibility refuses body_admin and auditor by design, so for them the notice would call a
  // normal refusal an outage and promise "check-in still works" on a desk that is read-only.
  it('is not shown on a read-only desk, where the roster read is refused by design', () => {
    renderDesk(-30, T0, false, {}, true);
    expect(screen.queryByText(/CPD eligibility couldn.t be checked/i)).toBeNull();
  });
});

describe('RosterClient: an attended row', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: T0 });
  });

  // The tick was written as `\\u2713` in JSX text, which React renders as the six characters, not a tick.
  it('shows a real tick, not an escape sequence', () => {
    renderDesk(-30, T0, true, { status: 'attended', check_in_at: min(-20), check_in_method: 'manual' });
    expect(screen.queryByText(/\\u2713/)).toBeNull();
    expect(document.body.textContent).toContain('\u2713');
  });
});

describe('RosterClient: check-in follows the clock (DB-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: T0 });
  });

  it('before the pre-open the Check in button and the scan buttons are disabled and say why', () => {
    renderDesk(90); // starts in 90 min: opens in 30
    expect(screen.getByRole('button', { name: /check in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/has not opened yet/i);
  });

  it('inside the pre-open they are enabled and the note is gone', () => {
    renderDesk(45);
    expect(screen.getByRole('button', { name: /check in/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
    expect(screen.queryByText(/has not opened yet/i)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Check-in is open.');
  });

  it('enables by itself when the clock crosses the pre-open, with no reload', () => {
    renderDesk(61); // opens in 1 minute
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(90_000); // two 30 s ticks past the boundary
    });
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /check in/i })).toBeEnabled();
    // The live region stays mounted so the change is announced; open, it holds screen-reader-only text.
    expect(screen.getByRole('status')).toHaveTextContent('Check-in is open.');
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });

  // DB-02 review F2: the desk runs on the SERVER's clock, so a tablet whose own clock is minutes behind does not
  // lock the door against a server that would accept the scan. Here the device says 06:00, the server says 08:00.
  it("follows the server's clock, not a tablet whose own clock is behind", () => {
    // Event starts 150 min after the device's 06:00; the server already says 08:00, so for the server the event
    // starts in 30 min (inside the pre-open). The device clock alone would keep every control disabled.
    renderDesk(150, T0 + 120 * 60_000);
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /check in/i })).toBeEnabled();
  });

  it('keeps counting from the server clock as the browser ticks', () => {
    renderDesk(150, T0 + 89 * 60_000); // server: starts in 61 min, one minute before the pre-open
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
  });

  it('re-reads the clock when the tab becomes visible again, without waiting for the interval', () => {
    renderDesk(61);
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    // The tablet slept: the clock jumps with no interval tick in between.
    vi.setSystemTime(T0 + 5 * 60_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
  });

  it('disables again, saying the event ended, when the clock passes the end', () => {
    renderDesk(-110); // started 110 min ago, ends in 10
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(11 * 60_000);
    });
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/closed/i);
  });
});

// RV-FINAL F2: a role that cannot check people in (body_admin, auditor) used to get a fully enabled desk whose every
// action ended on an error. Now the desk says so up front and nothing invites a doomed submit.
describe('RosterClient: a role that cannot check people in', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: T0 });
  });

  it('disables scan, enter code, the row button and the walk-in, and says why, even while the event is live', () => {
    renderDesk(-30, T0, false); // live: the clock alone would leave everything enabled
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /enter code/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /check in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /walk-in/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Your role cannot check people in. Ask an organiser admin or member.');
  });

  // Backtest M1: the Speakers card was the one control on the desk still live for these roles.
  it('hands the Speakers card the same role answer, for both classes', () => {
    renderDesk(-30, T0, false);
    expect(screen.getByTestId('speakers-probe')).toHaveAttribute('data-can-check-in', 'false');
    cleanup();
    renderDesk(-30, T0, true);
    expect(screen.getByTestId('speakers-probe')).toHaveAttribute('data-can-check-in', 'true');
  });
});
