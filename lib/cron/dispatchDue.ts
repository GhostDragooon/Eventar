import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';

export type DispatchCandidate = EventLifecycleRow & { id: string };
export type DueDispatch = { eventId: string; purpose: 'reminder' | 'survey' };

// The survey invite trails the event rather than landing the instant it ends.
export const SURVEY_DELAY_MINUTES = 10;

/**
 * Both windows CLOSE as well as open. Without a closing bound, first enablement
 * of the trigger would dispatch for every historical event that never got one
 * — a mass-mail incident, not a backfill. Recovery for a missed window is the
 * operator's existing manual button, which is a judgement call anyway.
 */
export const SURVEY_GRACE_HOURS = 24;

/**
 * Pure selection: which (event, purpose) pairs have an open dispatch window at
 * `nowMs`. No I/O — the caller supplies candidates and acts on the result.
 *
 * Deliberately derived from `computeLifecycle` rather than from raw timestamps,
 * so draft/cancelled handling and the 60-minute lead stay defined in exactly one
 * place. The reminder lead IS `CHECKIN_OPEN_MINUTES` by design: check-in opening
 * and the QR pass going out are the same beat (see eventLifecycle.ts G11).
 */
export function selectDue(candidates: DispatchCandidate[], nowMs: number): DueDispatch[] {
  // Carries each window's CLOSING time so the result can be ordered by urgency
  // before the caller's batch cap slices it.
  const due: Array<DueDispatch & { closesAtMs: number }> = [];

  for (const candidate of candidates) {
    const lifecycle = computeLifecycle(candidate, nowMs);
    const startMs = new Date(candidate.start_time).getTime();
    const endMs = new Date(candidate.end_time).getTime();

    // 'live' already means nowMs >= start − CHECKIN_OPEN_MINUTES; the extra
    // bound stops a "starts soon" mail going out after the event began.
    if (lifecycle === 'live' && nowMs < startMs) {
      due.push({ eventId: candidate.id, purpose: 'reminder', closesAtMs: startMs });
      continue;
    }

    if (
      lifecycle === 'completed' &&
      nowMs >= endMs + SURVEY_DELAY_MINUTES * 60_000 &&
      nowMs < endMs + SURVEY_GRACE_HOURS * 3_600_000
    ) {
      due.push({
        eventId: candidate.id,
        purpose: 'survey',
        closesAtMs: endMs + SURVEY_GRACE_HOURS * 3_600_000,
      });
    }
  }

  // Soonest-closing first. The caller caps how many it dispatches per run, so
  // this ordering decides who gets mailed AT ALL when more are due than fit —
  // not merely who goes first. A reminder's window shuts at start_time and the
  // mail is worthless after it; a survey behind it still has hours of grace.
  due.sort((a, b) => a.closesAtMs - b.closesAtMs);

  return due.map(({ eventId, purpose }) => ({ eventId, purpose }));
}
