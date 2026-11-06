import { StatusPill } from '@/components/lifecycle/StatusPill';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// StatusPill has no deleted state. The Events home and the Details header need "Deleted", so it is drawn here with
// StatusPill's own classes; every other state passes through.
const BASE = 'h-8 font-label-md text-label-md px-sm rounded-full uppercase inline-flex items-center gap-sm border border-transparent';

export function StatusChip({ lifecycle, deleted = false }: { lifecycle: Lifecycle; deleted?: boolean }) {
  if (deleted) return <span className={`${BASE} bg-surface-container-high text-on-surface-variant`}>Deleted</span>;
  return <StatusPill lifecycle={lifecycle} />;
}
