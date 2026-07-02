export type Lifecycle = 'drafted' | 'registering' | 'upcoming' | 'live' | 'completed' | 'cancelled';

// G11: check-in opens 60 min before start_time — the reminder email with the
// personal QR goes out then, so the live ops window starts pre-start.
export const CHECKIN_OPEN_MINUTES = 60;

// Intentional minimal coupling — the DB row carries far more columns,
// but the lifecycle derivation only needs these five.
// registration_open_at is optional so pre-window callers keep compiling;
// omitting it (or null) means "opens at publish" — the pre-v4 behaviour.
export type EventLifecycleRow = {
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  start_time: string;
  end_time: string;
  registration_close_at: string | null;
  registration_open_at?: string | null;
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
  const openMs = event.registration_open_at
    ? new Date(event.registration_open_at).getTime()
    : null;

  if (nowMs > endMs) return 'completed';
  if (nowMs >= startMs - CHECKIN_OPEN_MINUTES * 60_000) return 'live';
  if (closeMs != null && nowMs >= closeMs) return 'upcoming';
  // Editor v4: an event can publish in advance and sit as Upcoming (regs not
  // open yet) until the explicit open date arrives.
  if (openMs != null && nowMs < openMs) return 'upcoming';
  return 'registering';
}
