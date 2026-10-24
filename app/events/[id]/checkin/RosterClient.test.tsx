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
vi.mock('../details/multiBodyActions', () => ({
  setRegistrationRole: vi.fn(),
  removeRegistrationRole: vi.fn(),
}));
vi.mock('./SpeakersCard', () => ({ SpeakersCard: () => null }));

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

function renderDesk(startInMin: number, serverNowMs = T0) {
  return render(
    <RosterClient
      serverNowMs={serverNowMs}
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
        { id: 'r1', full_name: 'Ada Lovelace', email: 'ada@x.test', registration_code: 'WK-AAAAAA', status: 'registered', check_in_at: null, check_in_method: null },
      ]}
      eligibility={{}}
      eligibilityUnavailable={false}
      roles={{}}
      maxAttendees={null}
      speakerNames={[]}
      initialSpeakerCheckins={[]}
    />,
  );
}

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
