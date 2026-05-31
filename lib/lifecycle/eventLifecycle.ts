export type Lifecycle = 'drafted' | 'registering' | 'upcoming' | 'live' | 'completed' | 'cancelled';

// Intentional minimal coupling — the DB row carries far more columns,
// but the lifecycle derivation only needs these four.
export type EventLifecycleRow = {
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  start_time: string;
  end_time: string;
  registration_close_at: string | null;
};

export function computeLifecycle(event: EventLifecycleRow, nowMs: number): Lifecycle {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'drafted';
  if (event.status === 'completed') return 'completed';

  // status === 'published' — derive from timestamps. Anything past
  // end_time reads as completed; Phase 9 (pg_cron) will eventually
  // flip the DB row, but until then derivation gives the same result.
  const startMs = new Date(event.start_time).getTime();
  const endMs = new Date(event.end_time).getTime();
  const closeMs = event.registration_close_at
    ? new Date(event.registration_close_at).getTime()
    : null;

  if (nowMs > endMs) return 'completed';
  if (nowMs >= startMs) return 'live';
  if (closeMs != null && nowMs >= closeMs) return 'upcoming';
  return 'registering';
}
