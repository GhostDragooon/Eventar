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

/**
 * Single source of truth for "why can't a walk-in happen right now",
 * shared by the walk-in server action (walkInRegisterAndCheckIn) and the
 * WalkInDialog client component, so the two copies can't drift. `null`
 * means walk-ins are allowed (lifecycle === 'live').
 */
export function walkInClosedMessage(lifecycle: Lifecycle): string | null {
  // One voice with the rest of the check-in desk (DB-02): a walk-in is a registration plus a check-in, so it is
  // closed for exactly the reasons check-in is.
  return checkInGateMessage(lifecycle);
}

/**
 * Why check-in is refused, in one voice for the staff surfaces: the check-in desk, the staff scan action and the
 * walk-in dialog (DB-02). The attendee's own pass page speaks to the attendee and keeps its own copy.
 * mark_attended and self_check_in refuse outside [start - CHECKIN_OPEN_MINUTES, end] with `not_open_yet` and
 * `closed`; computeLifecycle's 'live' is the same window except the final instant (the SQL end is exclusive).
 */
export function checkInClosedMessage(reason: 'not_open_yet' | 'closed'): string {
  return reason === 'closed'
    ? 'Check-in is closed. This event has ended.'
    : `Check-in has not opened yet. It opens ${CHECKIN_OPEN_MINUTES} minutes before the event starts.`;
}

/** The same reason derived from the clock, for controls that follow it. `null` means check-in is open. */
export function checkInGateMessage(lifecycle: Lifecycle): string | null {
  if (lifecycle === 'live') return null;
  if (lifecycle === 'drafted') return 'Publish the event before checking people in.';
  if (lifecycle === 'completed') return checkInClosedMessage('closed');
  if (lifecycle === 'cancelled') return 'This event was cancelled. Check-in is closed.';
  return checkInClosedMessage('not_open_yet');
}
