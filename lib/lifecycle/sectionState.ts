import type { Lifecycle } from './eventLifecycle';

/**
 * Section-state ladder for the Event Details page (patterns §7a).
 *
 *   done   → window has passed; render in neutral surface, no accent.
 *   active → current focus; render with accent ring (the one moment of color).
 *   locked → window not yet reached (or not applicable); dim the card.
 *
 * "Cancelled" treats every section as locked — there is no useful active or
 * done state on a cancelled event; the cancelled pill carries the meaning.
 */
export type SectionName = 'registration' | 'attendance' | 'feedback';
export type SectionState = 'done' | 'active' | 'locked';

export function sectionState(section: SectionName, lifecycle: Lifecycle): SectionState {
  if (lifecycle === 'cancelled') return 'locked';

  if (section === 'registration') {
    if (lifecycle === 'registering' || lifecycle === 'upcoming') return 'active';
    if (lifecycle === 'live' || lifecycle === 'completed') return 'done';
    return 'locked'; // drafted
  }

  if (section === 'attendance') {
    if (lifecycle === 'live') return 'active';
    if (lifecycle === 'completed') return 'done';
    return 'locked';
  }

  // feedback
  if (lifecycle === 'completed') return 'active';
  return 'locked';
}
