export type Lifecycle = 'drafted' | 'registering' | 'upcoming' | 'live' | 'completed' | 'cancelled';

export type EventLifecycleRow = {
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  start_time: string;
  end_time: string;
  registration_close_at: string | null;
};

const AUTO_COMPLETE_MS = 48 * 60 * 60 * 1000;

export function computeLifecycle(event: EventLifecycleRow, nowMs: number): Lifecycle {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'drafted';
  if (event.status === 'completed') return 'completed';

  // status === 'published'
  const startMs = new Date(event.start_time).getTime();
  const endMs = new Date(event.end_time).getTime();
  const closeMs = event.registration_close_at
    ? new Date(event.registration_close_at).getTime()
    : null;

  if (nowMs > endMs) return 'completed'; // also covers > endMs + 48h
  if (nowMs >= startMs) return 'live';
  if (closeMs != null && nowMs >= closeMs) return 'upcoming';
  return 'registering';
}
