'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 15-minute increment time picker.
 *
 * - `value` is minutes-since-midnight (0..1439), multiple of 15, or null.
 * - The trigger looks like a styled input field; clicking opens a vertical
 *   list of 96 slots (00:00 → 23:45) per the New Event Setup mockup.
 * - On open, the list auto-scrolls to the current selection (or to 09:00
 *   if no selection — a saner default than midnight for a workshop form).
 * - Keyboard:
 *     ↓/↑   move highlight
 *     Enter commit
 *     Esc   close
 * - Outside-click + Esc both close.
 *
 * Time is displayed in 12-hour `08:30 AM` format to match the mockup.
 * The value the parent receives is always 24-hour minutes for math.
 */
export function TimePicker15({
  value,
  onChange,
  placeholder = 'Select time',
  invalid = false,
  disabled = false,
  ariaLabel,
}: {
  value: number | null;
  onChange: (minutes: number) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Highlight (keyboard focus) — distinct from `value` (committed selection).
  // Initialised to the committed value or 09:00 on open.
  const [highlight, setHighlight] = useState<number>(value ?? 9 * 60);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on outside click + Escape.
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

  // On open, center the current slot WITHIN the list only — scrolling the
  // inner <ul>'s scrollTop directly (not scrollIntoView, which would also
  // nudge the page now that the panel renders inline). No setState here —
  // the highlight reset lives in openPicker() (avoids set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const list = listRef.current;
      const idx = ((value ?? 9 * 60) / 15) | 0;
      const el = list?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
      if (list && el) {
        list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
      }
    });
  }, [open, value]);

  // Open via a handler (not an effect) so the highlight reset isn't a
  // synchronous setState inside useEffect.
  function openPicker() {
    setHighlight(value ?? 9 * 60);
    setOpen(true);
  }
  function commit(minutes: number) {
    onChange(minutes);
    setOpen(false);
  }
  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openPicker();
    }
  }
  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(23 * 60 + 45, h + 15));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 15));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(highlight);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-invalid={invalid || undefined}
        onClick={() => !disabled && (open ? setOpen(false) : openPicker())}
        onKeyDown={onTriggerKey}
        className={
          'w-full flex items-center justify-between rounded-lg border px-md py-sm transition-colors text-left ' +
          'focus:outline-none focus:ring-1 ' +
          (invalid
            ? 'border-error bg-error-container focus:border-error focus:ring-error/40'
            : 'border-outline-variant bg-surface-container-lowest focus:border-primary focus:ring-primary') +
          (disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')
        }
      >
        <span className={value === null ? 'font-body-md text-body-md text-outline' : 'font-body-md text-body-md text-on-surface'}>
          {value === null ? placeholder : formatMinutes12h(value)}
        </span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>
          schedule
        </span>
      </button>

      {open && (
        <div
          className="mt-xs bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden"
        >
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={0}
            onKeyDown={onListKey}
            className="relative max-h-[240px] overflow-y-auto py-sm focus:outline-none"
          >
            {Array.from({ length: 96 }, (_, i) => i * 15).map(min => {
              const isSelected = value === min;
              const isHighlight = highlight === min;
              return (
                <li
                  key={min}
                  data-idx={min / 15}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => commit(min)}
                  onMouseEnter={() => setHighlight(min)}
                  className={
                    'mx-sm my-[2px] rounded-full px-md py-sm cursor-pointer transition-colors text-center font-body-lg text-body-lg ' +
                    (isSelected
                      ? 'bg-primary text-on-primary font-bold'
                      : isHighlight
                      ? 'bg-surface-container-high text-on-surface'
                      : 'text-on-surface')
                  }
                >
                  {formatMinutes12h(min)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function formatMinutes12h(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatMinutes24h(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
