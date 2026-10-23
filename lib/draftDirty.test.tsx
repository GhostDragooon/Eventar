/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { markDraftSaved, setDraftDirty, useDraftDirty, useDraftSaved } from './draftDirty';

afterEach(() => { cleanup(); for (const id of ['a','b']) { setDraftDirty(id, true); setDraftDirty(id, false); } });

describe('draftDirty', () => {
  it('starts clean, follows setDraftDirty, and is per event', () => {
    const a = renderHook(() => useDraftDirty('a'));
    const b = renderHook(() => useDraftDirty('b'));
    expect(a.result.current).toBe(false);
    act(() => setDraftDirty('a', true));
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(false);
    act(() => setDraftDirty('a', false));
    expect(a.result.current).toBe(false);
  });

  it('marks a save: saved and not dirty, until the next change', () => {
    const dirty = renderHook(() => useDraftDirty('a'));
    const saved = renderHook(() => useDraftSaved('a'));
    expect(saved.result.current).toBe(false);
    act(() => setDraftDirty('a', true));
    act(() => markDraftSaved('a'));
    expect(saved.result.current).toBe(true);
    expect(dirty.result.current).toBe(false);
    act(() => setDraftDirty('a', true));
    expect(saved.result.current).toBe(false);
    expect(dirty.result.current).toBe(true);
  });
});
