import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

const STYLES: Record<Lifecycle, string> = {
  drafted: 'bg-surface-container-high text-on-surface-variant border border-outline-variant',
  registering: 'bg-primary-container/10 text-primary border border-primary-container/20',
  upcoming: 'bg-primary-fixed text-primary border border-primary-container/30',
  live: 'live-pill-pulse text-on-error border border-error',
  completed: 'bg-secondary-fixed text-on-secondary-fixed border border-transparent',
  cancelled: 'bg-error-container/30 text-on-error-container border border-error-container',
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
        <span className="w-1.5 h-1.5 rounded-full bg-on-error shrink-0" aria-hidden />
        {LABELS.live}
      </span>
    );
  }
  return <span className={`${base} ${STYLES[lifecycle]}`}>{LABELS[lifecycle]}</span>;
}
