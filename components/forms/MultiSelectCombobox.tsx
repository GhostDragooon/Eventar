'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

export type ComboboxOption = { id: string; label: string };

export function MultiSelectCombobox({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly ComboboxOption[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-xs">
      <label htmlFor="multi-select-search" className="font-label-md text-label-md text-on-surface">
        {label}
      </label>
      <div className="rounded-[12px] border border-outline-variant bg-surface-container-lowest p-sm">
        <div className="flex flex-wrap gap-xs pb-sm">
          {selected.map((id) => {
            const option = options.find((value) => value.id === id);
            return (
              option && (
                <Button
                  key={id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => toggle(id)}
                  className="min-h-8 px-sm"
                >
                  {option.label}
                  <span className="ml-xs" aria-hidden>×</span>
                  <span className="sr-only">Remove {option.label}</span>
                </Button>
              )
            );
          })}
        </div>
        <input
          id="multi-select-search"
          role="combobox"
          aria-expanded="true"
          aria-controls="multi-select-options"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
          placeholder="Search options"
        />
        {/* ui-primitive-allow: listbox options driven by role="option" — the
            same shape as WorkspaceSwitcher's options, not action buttons. */}
        <ul id="multi-select-options" role="listbox" aria-multiselectable="true" className="mt-sm max-h-56 overflow-auto">
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected.includes(option.id)}
                onClick={() => toggle(option.id)}
                className="flex min-h-11 w-full items-center justify-between rounded-lg px-md text-left text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span>{option.label}</span>
                {selected.includes(option.id) && (
                  <span className="material-symbols-outlined text-success" aria-hidden>check</span>
                )}
              </button>
            </li>
          ))}
          {!filtered.length && <li className="p-md text-on-surface-variant">No matching options.</li>}
        </ul>
      </div>
    </div>
  );
}
