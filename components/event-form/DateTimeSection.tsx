'use client';

import { DatePicker } from './DatePicker';
import {
  TimePicker15,
  formatMinutes12h,
  formatMinutes24h,
  formatDurationMinutes,
} from './TimePicker15';

/**
 * Phase-4.6-followup: switched the picker from a 1h chip strip to two
 * popover-style pickers per the mockup (calendar grid + 15-min slot list).
 *
 * State shape changed from { startHour, endHour } in 0..23 hours to
 * { startMinutes, endMinutes } in 0..1439 minutes (always a multiple of
 * 15 by construction — the picker only emits those). NewEventForm reads
 * the same fields with formatMinutes24h to build the ISO timestamps.
 *
 * The duration bar relocated here from AgendaSection per user feedback —
 * event-level Date & Time is where total event duration belongs; agenda
 * blocks just need start/end pickers.
 */

export type DateTimeValue = {
  date: string;                    // YYYY-MM-DD
  startMinutes: number | null;     // 0..1439, multiple of 15
  endMinutes: number | null;
};

type Props = {
  value: DateTimeValue;
  onChange: (patch: Partial<DateTimeValue>) => void;
};

export default function DateTimeSection({ value, onChange }: Props) {
  const dur = durationOrNull(value.startMinutes, value.endMinutes);

  // Duration bar scale: a workshop is realistically 1–12h. Clamp to 12h so
  // a normal-length event uses most of the bar width without saturating.
  const barPct = dur !== null ? Math.min(100, (dur / (12 * 60)) * 100) : 0;

  return (
    <div className="space-y-md">
      {/* Date on its own row so its inline calendar pushes the time row down
          cleanly (no grid-cell misalignment). Start/End share a 2-col row. */}
      <div className="max-w-[360px]">
        <Labelled label="Date" required>
          <DatePicker
            value={value.date}
            onChange={(iso) => onChange({ date: iso })}
            ariaLabel="Event date (required)"
          />
        </Labelled>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Labelled label="Start" required>
          <TimePicker15
            value={value.startMinutes}
            onChange={(m) => onChange({ startMinutes: m })}
            ariaLabel="Event start time (required)"
          />
        </Labelled>
        <Labelled label="End" required>
          <TimePicker15
            value={value.endMinutes}
            onChange={(m) => onChange({ endMinutes: m })}
            invalid={
              value.startMinutes !== null &&
              value.endMinutes !== null &&
              value.endMinutes <= value.startMinutes
            }
            disabled={value.startMinutes === null}
            ariaLabel="Event end time (required) — pick a start time first if disabled"
          />
        </Labelled>
      </div>

      {/* Duration bar + label (moved here from AgendaSection per user feedback). */}
      {dur !== null && (
        <div className="flex items-center gap-sm">
          <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden" aria-hidden>
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant whitespace-nowrap">
            {formatDurationMinutes(dur)}
          </span>
        </div>
      )}

      {value.startMinutes !== null && value.endMinutes !== null && value.endMinutes <= value.startMinutes && (
        <p className="font-body-md text-body-md text-error flex items-center gap-xs">
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>warning</span>
          End must be after Start.
        </p>
      )}

      <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant">
        Times are in your local timezone. The event page will display them in
        the venue&apos;s local time.
      </p>
    </div>
  );
}

function Labelled({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
        {label}{required && <span className="text-error ml-xs" aria-label="required">*</span>}
      </span>
      {children}
    </label>
  );
}

/* ============== exports consumed by NewEventForm.tsx ============== */

export function dateTimeSummary(v: DateTimeValue): string {
  if (!v.date || v.startMinutes === null || v.endMinutes === null) return 'Not set';
  const times = `${formatMinutes12h(v.startMinutes)}–${formatMinutes12h(v.endMinutes)}`;
  // Only append a duration when the range is valid; otherwise the collapsed
  // summary would show a negative duration (e.g. "-1h 30m") for end ≤ start.
  const dur = v.endMinutes > v.startMinutes
    ? ` (${formatDurationMinutes(v.endMinutes - v.startMinutes)})`
    : '';
  return `${formatDateShort(v.date)}, ${times}${dur}`;
}

export function dateTimeValid(v: DateTimeValue): boolean {
  return Boolean(v.date)
    && v.startMinutes !== null
    && v.endMinutes !== null
    && v.endMinutes > v.startMinutes;
}

/** Re-export so NewEventForm can build the ISO without re-importing it. */
export { formatMinutes24h };

function durationOrNull(s: number | null, e: number | null): number | null {
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return e - s;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
