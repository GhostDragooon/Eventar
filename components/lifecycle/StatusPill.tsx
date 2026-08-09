import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

/* Color-as-meaning (§7a): amber = draft · accent blue = registering ·
   green = live ONLY · neutral = upcoming/completed ("done" is the absence of
   color) · red = destructive (cancelled).
   Live was the one SOLID pill until 2026-08-09. #052e16 on #1e874b is 3.28:1,
   and --text-label-md is 12px/600 — normal text, which needs 4.5:1, since the
   3:1 large-text exemption starts at 18.66px bold. It now uses the same
   container+ink form as its siblings (7.21:1). The pulse and the dot are what
   carry "happening now" instead of the fill. */
const STYLES: Record<Lifecycle, string> = {
  drafted: 'bg-warning-container text-on-warning-container border border-transparent',
  registering: 'bg-primary-container text-on-primary-container border border-transparent',
  upcoming: 'bg-surface-container-high text-on-surface-variant border border-outline-variant',
  live: 'live-pill-pulse bg-success-container text-on-success-container border border-transparent',
  completed: 'bg-surface-container-high text-on-surface-variant border border-transparent',
  cancelled: 'bg-error-container text-on-error-container border border-transparent',
};

const LABELS: Record<Lifecycle, string> = {
  drafted: 'Drafted',
  registering: 'Registering',
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function StatusPill({ lifecycle }: { lifecycle: Lifecycle }) {
  const base = 'font-label-md text-label-md px-sm py-xs rounded-full uppercase inline-flex items-center gap-sm';
  if (lifecycle === 'live') {
    return (
      <span className={`${base} ${STYLES.live}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-on-success-container shrink-0" aria-hidden />
        {LABELS.live}
      </span>
    );
  }
  return <span className={`${base} ${STYLES[lifecycle]}`}>{LABELS[lifecycle]}</span>;
}
