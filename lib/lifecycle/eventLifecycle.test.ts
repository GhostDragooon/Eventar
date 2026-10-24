import { describe, expect, it } from 'vitest';
import { checkInClosedMessage, checkInGateMessage, computeLifecycle, walkInClosedMessage, type EventLifecycleRow } from './eventLifecycle';

const baseEvent = (overrides: Partial<EventLifecycleRow> = {}): EventLifecycleRow => ({
  status: 'published',
  start_time: '2026-06-01T10:00:00Z',
  end_time: '2026-06-01T12:00:00Z',
  registration_close_at: null,
  ...overrides,
});

const at = (iso: string) => new Date(iso).getTime();

describe('computeLifecycle', () => {
  it('returns cancelled for status=cancelled regardless of timestamps', () => {
    expect(computeLifecycle(baseEvent({ status: 'cancelled' }), at('2026-06-01T10:00:00Z'))).toBe('cancelled');
    expect(computeLifecycle(baseEvent({ status: 'cancelled' }), at('2025-01-01T00:00:00Z'))).toBe('cancelled');
  });

  it('returns drafted for status=draft', () => {
    expect(computeLifecycle(baseEvent({ status: 'draft' }), at('2026-05-30T00:00:00Z'))).toBe('drafted');
  });

  it('returns completed for status=completed (preserves manual completion)', () => {
    expect(computeLifecycle(baseEvent({ status: 'completed' }), at('2026-05-30T00:00:00Z'))).toBe('completed');
  });

  it('published before start, no close set → registering', () => {
    expect(computeLifecycle(baseEvent(), at('2026-05-30T00:00:00Z'))).toBe('registering');
  });

  it('published before start, close in past → upcoming', () => {
    expect(
      computeLifecycle(
        baseEvent({ registration_close_at: '2026-05-29T00:00:00Z' }),
        at('2026-05-30T00:00:00Z'),
      ),
    ).toBe('upcoming');
  });

  it('published before start, close in future → registering (boundary)', () => {
    expect(
      computeLifecycle(
        baseEvent({ registration_close_at: '2026-05-31T00:00:00Z' }),
        at('2026-05-30T00:00:00Z'),
      ),
    ).toBe('registering');
  });

  it('published, at start_time boundary (inclusive) → live', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-01T10:00:00Z'))).toBe('live');
  });

  // G11: check-in opens 60 min before start_time (reminder email + QR go out
  // then), so the live ops window — and the green "Live" pill — starts there.
  it('published, 30 min before start (check-in window open) → live', () => {
    expect(
      computeLifecycle(
        baseEvent({ registration_close_at: '2026-05-29T00:00:00Z' }),
        at('2026-06-01T09:30:00Z'),
      ),
    ).toBe('live');
  });

  it('published, 60 min + 1 s before start (check-in not yet open) → upcoming', () => {
    expect(
      computeLifecycle(
        baseEvent({ registration_close_at: '2026-05-29T00:00:00Z' }),
        at('2026-06-01T08:59:59Z'),
      ),
    ).toBe('upcoming');
  });

  it('published, exactly 60 min before start (inclusive boundary) → live', () => {
    expect(
      computeLifecycle(
        baseEvent({ registration_close_at: '2026-05-29T00:00:00Z' }),
        at('2026-06-01T09:00:00Z'),
      ),
    ).toBe('live');
  });

  it('published, 1s before end_time → live (unchanged)', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-01T11:59:59Z'))).toBe('live');
  });

  it('published, 1s after end_time → completed (unchanged)', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-01T12:00:01Z'))).toBe('completed');
  });

  it('published, at end_time boundary (inclusive) → live', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-01T12:00:00Z'))).toBe('live');
  });

  it('published, after end_time but within 48h → completed (derived)', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-01T13:00:00Z'))).toBe('completed');
  });

  it('published, beyond 48h post-end → completed (derived, same outcome)', () => {
    expect(computeLifecycle(baseEvent(), at('2026-06-10T00:00:00Z'))).toBe('completed');
  });
});

describe('walkInClosedMessage', () => {
  it('returns null (walk-ins allowed) when live', () => {
    expect(walkInClosedMessage('live')).toBeNull();
  });

  it('says the same thing as the rest of the check-in desk, for every state', () => {
    for (const l of ['drafted', 'registering', 'upcoming', 'completed', 'cancelled'] as const) {
      expect(walkInClosedMessage(l)).toBe(checkInGateMessage(l));
    }
  });

  it('names cancellation specifically', () => {
    expect(walkInClosedMessage('cancelled')).toMatch(/cancelled/i);
  });

  it('names the event having ended specifically, distinct from cancellation', () => {
    const msg = walkInClosedMessage('completed');
    expect(msg).toMatch(/ended/i);
    expect(msg).not.toMatch(/cancelled/i);
  });

  it.each(['registering', 'upcoming'] as const)('gives the not-opened-yet message for %s', (lifecycle) => {
    expect(walkInClosedMessage(lifecycle)).toBe('Check-in has not opened yet. It opens 60 minutes before the event starts.');
  });

  it('tells an unpublished draft to publish first', () => {
    expect(walkInClosedMessage('drafted')).toBe('Publish the event before checking people in.');
  });
});

// DB-02: mark_attended and self_check_in refuse outside [start - 60 min, end]; the desk says why in one voice.
describe('checkInClosedMessage', () => {
  it('says check-in has not opened and when it will', () => {
    expect(checkInClosedMessage('not_open_yet')).toBe('Check-in has not opened yet. It opens 60 minutes before the event starts.');
  });

  it('says check-in is closed because the event ended', () => {
    expect(checkInClosedMessage('closed')).toBe('Check-in is closed. This event has ended.');
  });

  it('carries no em-dash (Q41)', () => {
    expect(checkInClosedMessage('not_open_yet')).not.toContain('\u2014');
    expect(checkInClosedMessage('closed')).not.toContain('\u2014');
  });
});

describe('checkInGateMessage', () => {
  it('is null (check-in open) only when live', () => {
    expect(checkInGateMessage('live')).toBeNull();
  });

  it.each(['registering', 'upcoming'] as const)('says not opened yet for %s', (l) => {
    expect(checkInGateMessage(l)).toBe(checkInClosedMessage('not_open_yet'));
  });

  it('says closed for a completed event and names cancellation for a cancelled one', () => {
    expect(checkInGateMessage('completed')).toBe(checkInClosedMessage('closed'));
    expect(checkInGateMessage('cancelled')).toMatch(/cancelled/i);
  });
});
