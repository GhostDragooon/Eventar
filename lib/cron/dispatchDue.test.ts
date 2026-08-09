import { describe, expect, it } from 'vitest';
import { selectDue, type DispatchCandidate } from './dispatchDue';

// Event runs 10:00–12:00 UTC. Reminder window opens 09:00 (start − 60),
// survey window opens 12:10 (end + 10).
const event = (overrides: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  id: 'e1',
  status: 'published',
  start_time: '2026-06-01T10:00:00Z',
  end_time: '2026-06-01T12:00:00Z',
  registration_close_at: null,
  ...overrides,
});

const at = (iso: string) => new Date(iso).getTime();

describe('selectDue — reminder window', () => {
  it('fires at exactly start − 60min (window opens, inclusive)', () => {
    expect(selectDue([event()], at('2026-06-01T09:00:00Z'))).toEqual([
      { eventId: 'e1', purpose: 'reminder' },
    ]);
  });

  it('does not fire one minute before the window opens', () => {
    expect(selectDue([event()], at('2026-06-01T08:59:00Z'))).toEqual([]);
  });

  // The closing bound is the guard against blasting a "starts soon" mail for an
  // event already under way. Late arrivals are the operator's manual button.
  it('does not fire at or after start_time (window closes)', () => {
    expect(selectDue([event()], at('2026-06-01T10:00:00Z'))).toEqual([]);
    expect(selectDue([event()], at('2026-06-01T11:00:00Z'))).toEqual([]);
  });
});

describe('selectDue — survey window', () => {
  it('fires at exactly end + 10min (window opens, inclusive)', () => {
    expect(selectDue([event()], at('2026-06-01T12:10:00Z'))).toEqual([
      { eventId: 'e1', purpose: 'survey' },
    ]);
  });

  it('does not fire one minute before the window opens', () => {
    expect(selectDue([event()], at('2026-06-01T12:09:00Z'))).toEqual([]);
  });

  // Without this bound, first-ever enablement of the trigger would mail every
  // historical event that never got a survey. Seoul carries 7 such events.
  it('does not fire once the 24h grace window has passed', () => {
    expect(selectDue([event()], at('2026-06-02T12:11:00Z'))).toEqual([]);
  });

  it('respects the grace bound even when status was manually set completed', () => {
    const stale = event({ status: 'completed', end_time: '2020-01-01T12:00:00Z' });
    expect(selectDue([stale], at('2026-06-01T12:10:00Z'))).toEqual([]);
  });
});

describe('selectDue — event status', () => {
  it('never dispatches for a cancelled event, in either window', () => {
    expect(selectDue([event({ status: 'cancelled' })], at('2026-06-01T09:00:00Z'))).toEqual([]);
    expect(selectDue([event({ status: 'cancelled' })], at('2026-06-01T12:10:00Z'))).toEqual([]);
  });

  it('never dispatches for a draft event, in either window', () => {
    expect(selectDue([event({ status: 'draft' })], at('2026-06-01T09:00:00Z'))).toEqual([]);
    expect(selectDue([event({ status: 'draft' })], at('2026-06-01T12:10:00Z'))).toEqual([]);
  });
});

describe('selectDue — batching', () => {
  it('returns one entry per due event across differing windows', () => {
    const reminderDue = event({ id: 'a' });
    const surveyDue = event({
      id: 'b',
      start_time: '2026-06-01T06:00:00Z',
      end_time: '2026-06-01T08:50:00Z',
    });
    const notDue = event({ id: 'c', start_time: '2026-07-01T10:00:00Z', end_time: '2026-07-01T12:00:00Z' });

    expect(selectDue([reminderDue, surveyDue, notDue], at('2026-06-01T09:00:00Z'))).toEqual([
      { eventId: 'a', purpose: 'reminder' },
      { eventId: 'b', purpose: 'survey' },
    ]);
  });

  it('returns an empty list when nothing is due', () => {
    expect(selectDue([], at('2026-06-01T09:00:00Z'))).toEqual([]);
  });
});

// The caller slices this list to a fixed cap. An arbitrary order therefore
// decides who gets mailed at all, not just who gets mailed first: a reminder
// that misses its 60-min window is gone (the window closes at start_time),
// whereas a survey behind it still has most of a day left.
describe('selectDue — urgency ordering', () => {
  it('puts a reminder closing in an hour ahead of surveys with a day left', () => {
    // Surveys ended at 08:00, so each window closes 2026-06-02T08:00.
    const surveys = Array.from({ length: 20 }, (_, i) =>
      event({ id: `s${i}`, start_time: '2026-06-01T06:00:00Z', end_time: '2026-06-01T08:00:00Z' }),
    );
    // Reminder window closes at start_time — 10:00, 22 hours sooner.
    const reminder = event({ id: 'urgent' });

    const due = selectDue([...surveys, reminder], at('2026-06-01T09:00:00Z'));

    expect(due).toHaveLength(21);
    expect(due[0]).toEqual({ eventId: 'urgent', purpose: 'reminder' });
  });

  it('orders two reminders by which one starts sooner', () => {
    const later = event({ id: 'later', start_time: '2026-06-01T09:50:00Z', end_time: '2026-06-01T11:00:00Z' });
    const sooner = event({ id: 'sooner', start_time: '2026-06-01T09:10:00Z', end_time: '2026-06-01T11:00:00Z' });

    const due = selectDue([later, sooner], at('2026-06-01T09:00:00Z'));

    expect(due.map((d) => d.eventId)).toEqual(['sooner', 'later']);
  });
});
