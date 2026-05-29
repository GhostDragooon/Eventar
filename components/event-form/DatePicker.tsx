'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Calendar-grid date picker per the New Event Setup mockup.
 *
 * - value is an ISO date string YYYY-MM-DD or empty.
 * - Trigger looks like an input field; clicking opens a popover with
 *   month navigation (prev/next chevrons), day-of-week row, and a
 *   day-cell grid. Selected day = indigo filled circle.
 * - Today gets a subtle ring even when not selected, for orientation.
 * - Days from the prev/next month appear dimmed so the 6-row grid
 *   stays rectangular without empty cells (matches the reference).
 * - Outside-click + Escape close.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  invalid = false,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (value) {
      const d = parseIso(value);
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape.
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

  const today = stripTime(new Date());
  const selected = value ? parseIso(value) : null;

  const monthLabel = viewMonth.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const cells = monthCells(viewMonth);

  // Open via a handler (not an effect) so re-anchoring the view to the
  // value's month isn't a synchronous setState inside useEffect.
  function openPicker() {
    if (value) {
      const d = parseIso(value);
      if (d) setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setOpen(true);
  }
  function goPrev() {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function goNext() {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function pick(date: Date) {
    onChange(toIso(date));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-invalid={invalid || undefined}
        onClick={() => !disabled && (open ? setOpen(false) : openPicker())}
        className={
          'w-full flex items-center justify-between rounded-lg border bg-surface-container-lowest px-md py-sm transition-colors text-left ' +
          'focus:outline-none focus:ring-1 ' +
          (invalid
            ? 'border-error bg-error-container/10 focus:border-error focus:ring-error/40'
            : 'border-outline-variant focus:border-primary focus:ring-primary') +
          (disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')
        }
      >
        <span className={selected === null ? 'font-body-md text-body-md text-outline' : 'font-body-md text-body-md text-on-surface'}>
          {selected === null ? placeholder : formatDateLong(selected)}
        </span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>
          calendar_month
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 mt-xs z-50 w-[320px] bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl p-md"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-md">
            <span className="font-headline-sm text-[18px] text-on-surface">{monthLabel}</span>
            <div className="flex gap-xs">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous month"
                className="w-8 h-8 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden>chevron_left</span>
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next month"
                className="w-8 h-8 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden>chevron_right</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-xs mb-xs" aria-hidden>
            {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(d => (
              <div key={d} className="font-label-md text-label-md text-on-surface-variant text-center uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-xs">
            {cells.map((cell, i) => {
              const isOtherMonth = cell.getMonth() !== viewMonth.getMonth();
              const isSelected = selected && sameDay(cell, selected);
              const isToday = sameDay(cell, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(cell)}
                  className={
                    'w-10 h-10 mx-auto rounded-full flex items-center justify-center font-body-lg text-body-lg transition-colors ' +
                    (isSelected
                      ? 'bg-primary text-on-primary font-bold'
                      : isToday
                      ? 'ring-1 ring-primary text-on-surface hover:bg-surface-container-high'
                      : isOtherMonth
                      ? 'text-outline-variant hover:bg-surface-container-high'
                      : 'text-on-surface hover:bg-surface-container-high')
                  }
                  aria-pressed={isSelected || undefined}
                  aria-label={cell.toDateString()}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* Date helpers (pure) */

function parseIso(s: string): Date | null {
  // Parse local-date ISO YYYY-MM-DD as a local-noon Date to dodge TZ
  // edge cases at midnight near DST.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Returns 42 Date cells for a 6-row, 7-col grid covering the given month
 * plus the leading days from the previous month and trailing days from the
 * next month — matches the reference's filled rectangular grid.
 */
function monthCells(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  // getDay(): 0=Sunday, 6=Saturday — matches the SU-first header order.
  const lead = firstOfMonth.getDay();
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
