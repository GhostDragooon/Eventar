/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DateTimeSection from './DateTimeSection';

// The typed time is read in the BROWSER's zone but stored against the venue's zone. The line under test tells the
// organiser what the attendees will see. The browser zone is pinned with TZ and the dates are fixed, one in winter
// and one in summer, so daylight saving is covered and nothing depends on today's date.
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// DatePicker has its own live region, so the line is found by its test id and its role is asserted here.
function line() {
  const el = screen.getByTestId('venue-time-line');
  expect(el).toHaveAttribute('role', 'status');
  return el;
}

function show(opts: { tz: string; venueTz: string | null; date: string; start: number | null }) {
  vi.stubEnv('TZ', opts.tz);
  return render(
    <DateTimeSection
      value={{ date: opts.date, startMinutes: opts.start, endMinutes: opts.start === null ? null : opts.start + 60 }}
      onChange={() => {}}
      venueTz={opts.venueTz}
    />,
  );
}

describe('DateTimeSection: what attendees will see', () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('Hong Kong organiser, London venue, winter: 09:00 typed shows as 01:00', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Europe/London', date: '2026-12-01', start: 9 * 60 });
    const el = line();
    expect(el).toHaveTextContent(
      'You entered 09:00 in your time (Asia/Hong_Kong, GMT+8). This event will show 01:00 (Europe/London, GMT) to attendees.',
    );
  });

  it('same pair in summer: London is on BST, so 09:00 typed shows as 02:00', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Europe/London', date: '2026-07-01', start: 9 * 60 });
    expect(line()).toHaveTextContent(
      'You entered 09:00 in your time (Asia/Hong_Kong, GMT+8). This event will show 02:00 (Europe/London, BST) to attendees.',
    );
  });

  it('names the day when the venue is on another date', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Europe/London', date: '2026-12-01', start: 5 * 60 });
    expect(line()).toHaveTextContent('This event will show 21:00 on 30 Nov 2026 (Europe/London, GMT) to attendees.');
  });

  it.each([
    ['2026-12-01', 'EST', 'GMT-5', '22:00'],
    ['2026-07-01', 'EDT', 'GMT-4', '21:00'],
  ])('New York organiser, Hong Kong venue (%s)', (date, _name, label, shown) => {
    show({ tz: 'America/New_York', venueTz: 'Asia/Hong_Kong', date, start: 9 * 60 });
    expect(line()).toHaveTextContent(
      `You entered 09:00 in your time (America/New_York, ${label}). This event will show ${shown} (Asia/Hong_Kong, GMT+8) to attendees.`,
    );
  });

  it('is absent when the zones agree', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Asia/Hong_Kong', date: '2026-12-01', start: 9 * 60 });
    expect(screen.queryByTestId('venue-time-line')).toBeNull();
  });

  it('is absent when the zone names differ but the clock is the same', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Asia/Shanghai', date: '2026-12-01', start: 9 * 60 });
    expect(screen.queryByTestId('venue-time-line')).toBeNull();
  });

  it('is absent with no venue, or with no start time yet', () => {
    show({ tz: 'Asia/Hong_Kong', venueTz: null, date: '2026-12-01', start: 9 * 60 });
    expect(screen.queryByTestId('venue-time-line')).toBeNull();
    cleanup();
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Europe/London', date: '2026-12-01', start: null });
    expect(screen.queryByTestId('venue-time-line')).toBeNull();
    cleanup();
    show({ tz: 'Asia/Hong_Kong', venueTz: 'Europe/London', date: '', start: 9 * 60 });
    expect(screen.queryByTestId('venue-time-line')).toBeNull();
  });

  it('follows the fields: a new start time changes the line', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong');
    const props = { onChange: () => {}, venueTz: 'Europe/London' };
    const { rerender } = render(<DateTimeSection {...props} value={{ date: '2026-12-01', startMinutes: 9 * 60, endMinutes: 10 * 60 }} />);
    expect(line()).toHaveTextContent('will show 01:00');
    rerender(<DateTimeSection {...props} value={{ date: '2026-12-01', startMinutes: 15 * 60, endMinutes: 16 * 60 }} />);
    expect(line()).toHaveTextContent('You entered 15:00');
    expect(line()).toHaveTextContent('will show 07:00');
  });
});
