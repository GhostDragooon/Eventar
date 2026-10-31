// The Events home's four states. A plain module (no 'use client') so the server page can read ?tab= against this list;
// a constant exported from the client component arrives in a server component as a client reference, not an array.
export type TabKey = 'active' | 'drafts' | 'cancelled' | 'deleted';
export const TAB_KEYS: readonly TabKey[] = ['active', 'drafts', 'cancelled', 'deleted'];
