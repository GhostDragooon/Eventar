import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import type { AttendanceRecordView } from './schema';

// Which of the caller's registrations belong on which attendee page (Doctrine 2026-10-30 section 2):
//   live      - registered, and the check-in window is open (60 minutes before the start until the end), the same
//               window mark_attended enforces (lib/lifecycle/eventLifecycle.ts). Registrations and Check-in.
//   upcoming  - registered, window not open yet. Registrations; Check-in too when it opens within a day.
//   past      - everything else: the event ended, the registration was cancelled, the organiser cancelled, unpublished
//               or deleted the event (its registrations stay as they were), or the event row could not be resolved. History.
export type RegistrationBucket = 'live' | 'upcoming' | 'past';

export const CHECKIN_SOON_HOURS = 24;

export function bucketOf(r: AttendanceRecordView, nowMs: number): RegistrationBucket {
  if (r.status === 'cancelled' || !r.event_published || !r.event_start || !r.event_end) return 'past';
  const startMs = new Date(r.event_start).getTime();
  const endMs = new Date(r.event_end).getTime();
  if (nowMs >= endMs) return 'past';
  return nowMs >= startMs - CHECKIN_OPEN_MINUTES * 60_000 ? 'live' : 'upcoming';
}

export function splitRegistrations(items: AttendanceRecordView[], nowMs: number) {
  const out = { live: [] as AttendanceRecordView[], upcoming: [] as AttendanceRecordView[], past: [] as AttendanceRecordView[] };
  for (const r of items) out[bucketOf(r, nowMs)].push(r);
  // Soonest first; past stays in the action's own order (newest first).
  const byStart = (a: AttendanceRecordView, b: AttendanceRecordView) => (a.event_start ?? '').localeCompare(b.event_start ?? '');
  out.live.sort(byStart);
  out.upcoming.sort(byStart);
  return out;
}

/** Check-in shows what is open now and what opens within a day; a pass for next month has nothing to say yet. */
export function opensWithinADay(r: AttendanceRecordView, nowMs: number): boolean {
  if (bucketOf(r, nowMs) !== 'upcoming' || !r.event_start) return false;
  return new Date(r.event_start).getTime() - CHECKIN_OPEN_MINUTES * 60_000 - nowMs <= CHECKIN_SOON_HOURS * 3_600_000;
}
