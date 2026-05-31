import { describe, expect, it } from 'vitest';
import { groupByLifecycle } from './groupByLifecycle';
import type { EventLifecycleRow } from './eventLifecycle';

const ev = (
  id: string,
  status: EventLifecycleRow['status'],
  start: string,
  end: string,
): EventLifecycleRow & { id: string } => ({
  id,
  status,
  start_time: start,
  end_time: end,
  registration_close_at: null,
});

const NOW = new Date('2026-06-01T10:00:00Z').getTime();

describe('groupByLifecycle', () => {
  it('returns a map keyed by all 5 lifecycle stages (+ cancelled) even when empty', () => {
    const grouped = groupByLifecycle([], NOW);
    expect(Object.keys(grouped).sort()).toEqual([
      'cancelled',
      'completed',
      'drafted',
      'live',
      'registering',
      'upcoming',
    ]);
    expect(grouped.drafted).toEqual([]);
  });

  it('groups events into correct lifecycle buckets', () => {
    const events = [
      ev('a', 'draft', '2026-07-01T10:00:00Z', '2026-07-01T12:00:00Z'),
      ev('b', 'published', '2026-07-01T10:00:00Z', '2026-07-01T12:00:00Z'),
      ev('c', 'published', '2026-06-01T09:00:00Z', '2026-06-01T11:00:00Z'), // live now
      ev('d', 'completed', '2026-05-01T10:00:00Z', '2026-05-01T12:00:00Z'),
    ];
    const grouped = groupByLifecycle(events, NOW);
    expect(grouped.drafted.map((e) => e.id)).toEqual(['a']);
    expect(grouped.registering.map((e) => e.id)).toEqual(['b']);
    expect(grouped.live.map((e) => e.id)).toEqual(['c']);
    expect(grouped.completed.map((e) => e.id)).toEqual(['d']);
  });

  it('groups by a key extractor when caller has already derived lifecycle', () => {
    type Decorated = { id: string; lifecycle: 'drafted' | 'live' | 'completed' };
    const items: Decorated[] = [
      { id: 'a', lifecycle: 'drafted' },
      { id: 'b', lifecycle: 'live' },
      { id: 'c', lifecycle: 'completed' },
      { id: 'd', lifecycle: 'live' },
    ];
    const grouped = groupByLifecycle(items, (i) => i.lifecycle);
    expect(grouped.drafted.map((i) => i.id)).toEqual(['a']);
    expect(grouped.live.map((i) => i.id)).toEqual(['b', 'd']);
    expect(grouped.completed.map((i) => i.id)).toEqual(['c']);
    expect(grouped.registering).toEqual([]);
  });
});
