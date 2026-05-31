import { computeLifecycle, type EventLifecycleRow, type Lifecycle } from './eventLifecycle';

export type GroupedByLifecycle<T> = Record<Lifecycle, T[]>;

const empty = (): GroupedByLifecycle<never> => ({
  drafted: [],
  registering: [],
  upcoming: [],
  live: [],
  completed: [],
  cancelled: [],
});

/**
 * Group items by lifecycle. Either:
 *   - Pass raw event rows + nowMs, lifecycle is derived per item.
 *   - Pass already-decorated items + a key extractor (avoids re-deriving lifecycle when
 *     the caller has already computed it during a previous pass).
 */
export function groupByLifecycle<T extends EventLifecycleRow>(
  events: T[],
  nowMs: number,
): GroupedByLifecycle<T>;
export function groupByLifecycle<T>(
  items: T[],
  getLifecycle: (item: T) => Lifecycle,
): GroupedByLifecycle<T>;
export function groupByLifecycle<T>(
  items: T[],
  arg: number | ((item: T) => Lifecycle),
): GroupedByLifecycle<T> {
  const out = empty() as GroupedByLifecycle<T>;
  const getLifecycle =
    typeof arg === 'function'
      ? arg
      : (item: T) => computeLifecycle(item as unknown as EventLifecycleRow, arg);
  for (const item of items) {
    out[getLifecycle(item)].push(item);
  }
  return out;
}
