'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type Workspace = { id: string; name: string; description?: string };

export function WorkspaceSwitcher({
  workspaces,
  currentId,
  onSelect,
  onCreate,
}: {
  workspaces: readonly Workspace[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = workspaces.find((x) => x.id === currentId);
  const filtered = useMemo(
    () => workspaces.filter((x) => x.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query, workspaces],
  );

  // Outside-click + Escape close, matching DatePicker/TimePicker15.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openPicker() {
    setQuery('');
    setHighlightId(currentId);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectWorkspace(id: string) {
    onSelect(id);
    setOpen(false);
    setQuery('');
  }

  // Arrow-key highlight + Enter-to-select, matching TimePicker15's roving
  // selection — the aria-activedescendant technique rather than roving
  // tabindex, since focus stays on the search input while typing.
  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      const currentIndex = filtered.findIndex((w) => w.id === highlightId);
      const nextIndex =
        e.key === 'ArrowDown'
          ? Math.min(filtered.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      setHighlightId(filtered[nextIndex]?.id ?? filtered[0].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightId && filtered.some((w) => w.id === highlightId)) selectWorkspace(highlightId);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex min-h-11 w-full items-center justify-between px-md text-left"
      >
        <span>
          <strong className="block text-on-surface">{current?.name ?? 'Select workspace'}</strong>
          <small className="text-on-surface-variant">{current?.description}</small>
        </span>
        <span className="material-symbols-outlined" aria-hidden>
          expand_more
        </span>
      </Button>

      {open && (
        <div className="absolute z-30 mt-xs w-full min-w-72 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-sm shadow-lg">
          <label className="sr-only" htmlFor="workspace-search">
            Search workspaces
          </label>
          <input
            ref={inputRef}
            id="workspace-search"
            role="combobox"
            aria-expanded={open}
            aria-controls="workspace-listbox"
            aria-activedescendant={highlightId ? `workspace-option-${highlightId}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightId(null);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search workspaces"
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-md text-on-surface outline-none placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary"
          />
          <div id="workspace-listbox" role="listbox" aria-label="Workspaces" className="mt-sm max-h-64 overflow-auto">
            {filtered.map((workspace) => (
              // ui-primitive-allow: a listbox option is not an action button.
              // It carries role="option" + tabIndex={-1} and is driven by the
              // input's aria-activedescendant; <Button> would layer button
              // semantics and focus behaviour onto it and break the combobox
              // keyboard pattern (arrow keys / Enter / Escape).
              <button
                key={workspace.id}
                id={`workspace-option-${workspace.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={workspace.id === currentId}
                onMouseEnter={() => setHighlightId(workspace.id)}
                onClick={() => selectWorkspace(workspace.id)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between rounded-full px-md text-left text-on-surface focus:outline-none',
                  workspace.id === highlightId ? 'bg-surface-container' : 'hover:bg-surface-container',
                )}
              >
                <span>{workspace.name}</span>
                {workspace.id === currentId && (
                  <span className="material-symbols-outlined text-success" aria-hidden>
                    check
                  </span>
                )}
              </button>
            ))}
            {!filtered.length && <p className="p-md text-on-surface-variant">No matching workspaces.</p>}
          </div>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="mt-sm min-h-11 w-full border-t border-outline-variant px-md pt-sm text-left font-label-md text-label-md text-primary-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Create workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
