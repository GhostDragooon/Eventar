import { StatusPill } from '@/components/lifecycle/StatusPill';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// StatusPill labels the draft state "Drafted" (a verb) and has no deleted state. The Events home and the Details header
// need "Draft" and "Deleted", so those two are drawn here with StatusPill's own classes; every other state passes through.
// ponytail: the proper fix is the label in components/lifecycle/StatusPill.tsx (not in this change's scope); this wrapper goes then.
const BASE = 'h-8 font-label-md text-label-md px-sm rounded-full uppercase inline-flex items-center gap-sm border border-transparent';

export function StatusChip({ lifecycle, deleted = false }: { lifecycle: Lifecycle; deleted?: boolean }) {
  if (deleted) return <span className={`${BASE} bg-surface-container-high text-on-surface-variant`}>Deleted</span>;
  if (lifecycle === 'drafted') return <span className={`${BASE} bg-warning-container text-on-warning-container`}>Draft</span>;
  return <StatusPill lifecycle={lifecycle} />;
}
