import { useSyncExternalStore } from 'react';

// "Where is this draft's form since it was last saved?", shared between the edit form, the Publish card and
// the saved banner. They sit side by side under a server page with no common client parent, so a tiny store
// links them. ponytail: module-level, per event id; replace with a context if a client parent ever wraps them.
type Status = 'clean' | 'dirty' | 'saved';
const status = new Map<string, Status>();
const listeners = new Set<() => void>();

function set(eventId: string, next: Status) {
  if ((status.get(eventId) ?? 'clean') === next) return;
  if (next === 'clean') status.delete(eventId);
  else status.set(eventId, next);
  listeners.forEach((l) => l());
}

export function setDraftDirty(eventId: string, value: boolean) {
  if (value) set(eventId, 'dirty');
  else if (status.get(eventId) === 'dirty') set(eventId, 'clean');
}

/** The form saved successfully: not dirty any more, and the banner may say so. */
export function markDraftSaved(eventId: string) {
  set(eventId, 'saved');
}

/** A fresh edit form starts from nothing: forget a dirty or saved flag left by an earlier visit. */
export function resetDraftStatus(eventId: string) {
  set(eventId, 'clean');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function useStatus(eventId: string): Status {
  return useSyncExternalStore(
    subscribe,
    () => status.get(eventId) ?? 'clean',
    () => 'clean' as Status,
  );
}

export const useDraftDirty = (eventId: string) => useStatus(eventId) === 'dirty';
export const useDraftSaved = (eventId: string) => useStatus(eventId) === 'saved';
