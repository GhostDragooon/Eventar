/** @vitest-environment jsdom */
// Attendee surfaces card: Registrations and Check-in render inside the portal shell, answer the empty and populated
// cases, and never point an attendee at the organiser side.
import { vi } from 'vitest';

const loaded = vi.hoisted(() => ({ items: [] as unknown[], failed: false }));
vi.mock('./loadMyRegistrations', () => ({ loadMyRegistrations: async () => loaded }));
vi.mock('@/components/shell/AccountShell', () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import RegistrationsPage from './registrations/page';
import CheckinPage from './check-in/page';
import type { AttendanceRecordView } from './schema';

const HOUR = 3_600_000;
const reg = (id: string, title: string, startOffsetH: number, over: Partial<AttendanceRecordView> = {}): AttendanceRecordView => ({
  registration_id: id,
  event_id: `event-${id}`,
  event_title: title,
  event_start: new Date(Date.now() + startOffsetH * HOUR).toISOString(),
  event_end: new Date(Date.now() + (startOffsetH + 2) * HOUR).toISOString(),
  event_published: true,
  event_timezone: 'Asia/Hong_Kong',
  registration_code: `CODE${id}`,
  status: 'registered',
  check_in_at: null,
  check_in_method: null,
  source: 'self_registration',
  has_credit: false,
  ...over,
});

beforeEach(() => {
  loaded.items = [];
  loaded.failed = false;
});
afterEach(cleanup);

const hrefs = () => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');

describe('Registrations', () => {
  it('mounts inside the portal shell, with the page name as its heading', async () => {
    render(await RegistrationsPage());
    const shell = screen.getByTestId('shell');
    expect(within(shell).getByRole('heading', { level: 1, name: 'Registrations' })).toBeTruthy();
  });

  it('empty: says there is nothing, where past events went, and one way forward to Events', async () => {
    loaded.items = [reg('p', 'Over already', -10)];
    render(await RegistrationsPage());
    expect(screen.getByText(/not registered for any upcoming events/i)).toBeTruthy();
    expect(screen.getByText(/Past events are in History/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Find events' })).toHaveAttribute('href', '/events');
    expect(screen.queryByText('Over already')).toBeNull();
  });

  it('populated: live first with a pass link, upcoming under it, past and cancelled left out', async () => {
    loaded.items = [
      reg('u', 'Later event', 30),
      reg('l', 'Happening now', -0.5),
      reg('c', 'Cancelled one', 30, { status: 'cancelled' }),
      reg('p', 'Over already', -10),
    ];
    render(await RegistrationsPage());
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(titles[0]).toContain('Happening now');
    expect(titles[1]).toContain('Later event');
    expect(titles).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Show my pass' })).toHaveAttribute('href', '/checkin/confirm?code=CODEl');
    expect(screen.getByRole('link', { name: 'Later event' })).toHaveAttribute('href', '/events/event-u');
    expect(screen.getByRole('link', { name: 'Find more events' })).toHaveAttribute('href', '/events');
  });

  it('a failed read says so; it never claims there is nothing registered', async () => {
    loaded.failed = true;
    render(await RegistrationsPage());
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.queryByText(/not registered for any/)).toBeNull();
  });
});

describe('Check-in', () => {
  it('mounts inside the portal shell, with the window rule in its lead', async () => {
    render(await CheckinPage());
    const shell = screen.getByTestId('shell');
    expect(within(shell).getByRole('heading', { level: 1, name: 'Check-in' })).toBeTruthy();
    expect(within(shell).getByText(/opens 60 minutes before an event starts and closes when it ends/)).toBeTruthy();
  });

  it('empty: points to Registrations, not to a pass that does not exist', async () => {
    loaded.items = [reg('far', 'Next month', 24 * 30)];
    render(await CheckinPage());
    expect(screen.getByText(/Nothing to check in to right now/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See my registrations' })).toHaveAttribute('href', '/account/registrations');
    expect(screen.queryByRole('link', { name: 'Show my pass' })).toBeNull();
  });

  it('shows the pass for what is open now and what opens within a day, with when it opens', async () => {
    loaded.items = [reg('l', 'Open now', -0.5), reg('s', 'Tonight', 6), reg('far', 'Next month', 24 * 30)];
    render(await CheckinPage());
    expect(screen.getAllByRole('link', { name: 'Show my pass' })).toHaveLength(2);
    expect(screen.getByText('Check-in is open')).toBeTruthy();
    expect(screen.getByText(/Check-in opens at/)).toBeTruthy();
    expect(screen.queryByText('Next month')).toBeNull();
  });

  it('an attendee already checked in is told so and offered no second pass', async () => {
    loaded.items = [reg('l', 'Open now', -0.5, { status: 'attended' })];
    render(await CheckinPage());
    expect(screen.getByText('You are checked in')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Show my pass' })).toBeNull();
  });
});

describe('no cross-persona leakage', () => {
  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s links only to attendee routes and the public pass', async (_n, Page) => {
    loaded.items = [reg('l', 'Open now', -0.5), reg('u', 'Later', 30)];
    render(await Page());
    for (const h of hrefs()) {
      expect(h).not.toMatch(/^\/(dashboard|login|settings|participants|analytics)/);
      expect(h).not.toMatch(/\/events\/[^/]+\/(edit|details|registrations|checkin)/);
    }
  });
});
