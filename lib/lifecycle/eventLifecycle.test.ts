import { describe, expect, it } from 'vitest';
import { computeLifecycle, type EventLifecycleRow } from './eventLifecycle';

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
