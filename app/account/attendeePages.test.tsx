/** @vitest-environment jsdom */
// Attendee surfaces card: Registrations and Check-in render inside the portal shell, answer the empty and populated
// cases, and never point an attendee at the organiser side.
import { vi } from 'vitest';

const loaded = vi.hoisted(() => ({ items: [] as unknown[], failed: false, unlinkedCount: 0, licenceMissing: false }));
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

// Pin only the Date (waitFor keeps real timers): the opens-at strings and the 60-minute boundary read the clock.
const NOW = new Date('2026-12-13T12:00:00Z');
beforeEach(() => {
  loaded.items = [];
  loaded.failed = false;
  loaded.licenceMissing = false;
  loaded.unlinkedCount = 0;
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

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

describe('Registrations: when check-in opens', () => {
  const at = (id: string, startIso: string) => reg(id, `Event ${id}`, 0, { event_start: startIso, event_end: new Date(Date.parse(startIso) + 2 * HOUR).toISOString() });

  it('an upcoming row says when check-in opens, with the date and the event zone, instead of "Registered"', async () => {
    loaded.items = [at('a', '2026-12-14T01:00:00Z')]; // 09:00 on 14 Dec in Hong Kong
    render(await RegistrationsPage());
    expect(screen.getByText('14 Dec 2026, 09:00 (GMT+8)')).toBeTruthy();
    expect(screen.getByText('Check-in opens at 14 Dec 2026, 08:00 (GMT+8)')).toBeTruthy();
    expect(screen.queryByText('Registered')).toBeNull();
  });

  it('a start at 00:30 opens on the previous local date: the date stays in the string', async () => {
    loaded.items = [at('b', '2026-12-14T16:30:00Z')]; // 00:30 on 15 Dec in Hong Kong
    render(await RegistrationsPage());
    expect(screen.getByText('15 Dec 2026, 00:30 (GMT+8)')).toBeTruthy();
    expect(screen.getByText('Check-in opens at 14 Dec 2026, 23:30 (GMT+8)')).toBeTruthy();
  });

  it('uses the event zone, not the server zone', async () => {
    loaded.items = [{ ...at('c', '2026-12-14T14:00:00Z'), event_timezone: 'America/New_York' }]; // 09:00 EST
    render(await RegistrationsPage());
    expect(screen.getByText('Check-in opens at 14 Dec 2026, 08:00 (GMT-5)')).toBeTruthy();
  });

  it('61 minutes before the start: still "opens at"; at 60 minutes the window is open and the sentence is gone', async () => {
    loaded.items = [at('d', '2026-12-13T13:00:00Z')]; // opens 12:00Z = 20:00 HKT
    vi.setSystemTime(new Date('2026-12-13T11:59:00Z'));
    const first = render(await RegistrationsPage());
    expect(screen.getByText('Check-in opens at 13 Dec 2026, 20:00 (GMT+8)')).toBeTruthy();
    first.unmount();
    vi.setSystemTime(new Date('2026-12-13T12:00:00Z'));
    render(await RegistrationsPage());
    expect(screen.getAllByText('Check-in is open')).toHaveLength(2); // the section title and the row
    expect(screen.queryByText(/Check-in opens at/)).toBeNull();
  });
});

describe('Check-in', () => {
  it('the opens-at row carries the zone too', async () => {
    loaded.items = [reg('t', 'Tonight', 0, { event_start: '2026-12-13T18:00:00Z', event_end: '2026-12-13T20:00:00Z' })];
    render(await CheckinPage());
    expect(screen.getByText('Check-in opens at 14 Dec 2026, 01:00 (GMT+8)')).toBeTruthy();
    expect(screen.getByText('14 Dec 2026, 02:00 (GMT+8)')).toBeTruthy();
  });

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

describe('guest-registration banner (Registrations and Check-in)', () => {
  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s: count 0 shows no banner', async (_n, Page) => {
    render(await Page());
    expect(screen.queryByText(/made with your email as a guest/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Link past registrations' })).toBeNull();
  });

  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s: count 1 is singular, with the link to the claim page', async (_n, Page) => {
    loaded.unlinkedCount = 1;
    render(await Page());
    expect(screen.getByText(/We found 1 registration made with your email as a guest\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Link past registrations' })).toHaveAttribute('href', '/account/claim');
  });

  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s: count N is plural', async (_n, Page) => {
    loaded.unlinkedCount = 5;
    render(await Page());
    expect(screen.getByText(/We found 5 registrations made with your email as a guest\./)).toBeTruthy();
  });

  it('the banner sits next to a failed-read alert, not instead of it', async () => {
    loaded.failed = true;
    loaded.unlinkedCount = 2;
    render(await RegistrationsPage());
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByText(/We found 2 registrations/)).toBeTruthy();
  });
});

// Ivan 2026-11-04: the wizard can be finished without a licence, so the portal says the account is not finished.
describe('no-licence banner (Registrations and Check-in)', () => {
  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s: a declared licence shows no banner', async (_n, Page) => {
    render(await Page());
    expect(screen.queryByRole('link', { name: 'Add a licence' })).toBeNull();
  });

  it.each([
    ['Registrations', RegistrationsPage],
    ['Check-in', CheckinPage],
  ])('%s: no licence says setup is unfinished and links to the profile', async (_n, Page) => {
    loaded.licenceMissing = true;
    render(await Page());
    expect(screen.getByText(/Account setup is not finished/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add a licence' })).toHaveAttribute('href', '/account/profile');
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
