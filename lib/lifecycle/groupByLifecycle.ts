import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from './eventLifecycle';

export type GroupedByLifecycle<T> = Record<Lifecycle, T[]>;

export function groupByLifecycle<T extends EventLifecycleRow>(
  events: T[],
  nowMs: number,
): GroupedByLifecycle<T> {
  const out: GroupedByLifecycle<T> = {
    drafted: [],
    registering: [],
    upcoming: [],
    live: [],
    completed: [],
    cancelled: [],
  };
  for (const ev of events) {
    out[computeLifecycle(ev, nowMs)].push(ev);
  }
  return out;
}
