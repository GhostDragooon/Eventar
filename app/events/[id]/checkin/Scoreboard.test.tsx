/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Scoreboard } from './Scoreboard';

const PAST_START = Date.now() - 26 * 60 * 60 * 1000; // 1d 2h ago
const PAST_END = Date.now() - 24 * 60 * 60 * 1000; // 1d ago — 2h after PAST_START
const FUTURE_END = Date.now() + 60 * 60 * 1000; // still running/hasn't started

// vitest.config has no globals:true, so RTL doesn't auto-clean between
// tests — each render() otherwise piles onto the same jsdom document and
// getByText starts throwing "multiple elements found" once two cases share
// a label substring (e.g. drafted + registering both render "Not open yet").
afterEach(cleanup);

describe('Scoreboard', () => {
  it.each([
    ['drafted', /not open yet/i],
    ['registering', /not open yet/i],
    ['upcoming', /door prep/i],
    ['live', /^live$/i],
    ['completed', /closed/i],
    ['cancelled', /cancelled/i],
  ] as const)('renders %s lifecycle with the %s status label', (lifecycle, labelRegex) => {
    render(<Scoreboard lifecycle={lifecycle} startMs={PAST_START} endMs={FUTURE_END} attended={1} registered={1} />);
    // Scoped to the status badge specifically: the cancelled lifecycle's
    // headline (below) now also reads "Cancelled" on purpose (see the
    // user-lens regression test), so an unscoped query is ambiguous for
    // that one case.
    const badge = screen.getByText('Status').parentElement!;
    expect(within(badge).getByText(labelRegex)).toBeInTheDocument();
  });

  it('F-CHECKIN-1 regression: a completed event never reads "Not open yet"', () => {
    // The bug: an event that started 1d+ ago and finished (attendance
    // already resolved) fell through the old 2-branch ternary to the same
    // "Not open yet" copy shown before the event's check-in window opens —
    // directly false, and a completed event's own check-in desk claimed
    // check-in hadn't started.
    render(<Scoreboard lifecycle="completed" startMs={PAST_START} endMs={PAST_END} attended={1} registered={1} />);
    expect(screen.queryByText(/not open yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/closed/i)).toBeInTheDocument();
  });

  it.each([
    ['drafted', 'pending'],
    ['registering', 'pending'],
    ['upcoming', 'pending'],
    ['live', 'live'],
    ['completed', 'final'],
    ['cancelled', 'n/a'],
  ] as const)('shows the %s lifecycle\'s attendance eyebrow as "%s"', (lifecycle, sub) => {
    render(<Scoreboard lifecycle={lifecycle} startMs={PAST_START} endMs={FUTURE_END} attended={1} registered={1} />);
    expect(screen.getByText(new RegExp(`attendance · ${sub}`, 'i'))).toBeInTheDocument();
  });

  it('user-lens regression: a completed event\'s headline says it ended, not just when it started', () => {
    // Before this fix, the big headline always read "Started Xh ago" for
    // any past start time — true but misleading right next to a "Closed"
    // badge, since it never distinguished "still live, started a while
    // ago" (correct for that state) from "this is over" (completed).
    render(<Scoreboard lifecycle="completed" startMs={PAST_START} endMs={PAST_END} attended={1} registered={1} />);
    expect(screen.queryByText(/^started/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^ended .+ ago$/i)).toBeInTheDocument();
  });

  it('a live event\'s headline still reads "Started X ago" (unchanged behaviour)', () => {
    render(<Scoreboard lifecycle="live" startMs={PAST_START} endMs={FUTURE_END} attended={1} registered={1} />);
    expect(screen.getByText(/^started .+ ago$/i)).toBeInTheDocument();
  });

  it('a cancelled event\'s headline echoes Cancelled rather than claiming a duration', () => {
    render(<Scoreboard lifecycle="cancelled" startMs={PAST_START} endMs={PAST_END} attended={0} registered={1} />);
    const matches = screen.getAllByText(/^cancelled$/i);
    expect(matches.length).toBeGreaterThanOrEqual(2); // status badge + headline
  });
});
