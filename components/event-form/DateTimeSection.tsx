'use client';

import { browserTz, formatInTzWithZone } from '@/lib/tz';
import { DatePicker } from './DatePicker';
import {
  TimePicker15,
  formatMinutes12h,
  formatMinutes24h,
  formatDurationMinutes,
} from './TimePicker15';

/**
 * Date is a permanently visible inline calendar (left column); Start/End
 * are 15-min slot pickers (right column, side by side).
 *
 * State shape: { startMinutes, endMinutes } in 0..1439 minutes (always a
 * multiple of 15 by construction — the picker only emits those).
 * NewEventForm reads the same fields with formatMinutes24h to build the
 * ISO timestamps.
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
  /** Zone of the picked venue. With it, the form says what attendees will see for the start time you typed. */
  venueTz?: string | null;
};

export default function DateTimeSection({ value, onChange, venueTz }: Props) {
  const dur = durationOrNull(value.startMinutes, value.endMinutes);

  // Duration bar scale: a workshop is realistically 1–12h. Clamp to 12h so
  // a normal-length event uses most of the bar width without saturating.
  const barPct = dur !== null ? Math.min(100, (dur / (12 * 60)) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-lg items-start">
      {/* Left: permanently visible inline calendar (no popover/dropdown).
          Not a <label> here — a <label> only usefully associates with one
          labelable control, but the inline calendar renders 44 of them
          (42 day cells + 2 month-nav buttons). This heading is purely
          visual; the accessible name comes from the calendar's own
          role="group" aria-label (set to the ariaLabel prop below). */}
      <div>
        <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
          Date<span className="text-error ml-xs" aria-label="required">*</span>
        </span>
        <DatePicker
          value={value.date}
          onChange={(iso) => onChange({ date: iso })}
          ariaLabel="Event date (required)"
          inline
        />
      </div>

      {/* Right: Start/End side by side, duration bar, then the timezone note. */}
      <div className="space-y-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
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
        <VenueTimeLine value={value} venueTz={venueTz} />
      </div>
    </div>
  );
}

/**
 * The typed start is read in the browser's zone (new Date(`${date}T${hh:mm}:00`), the same read the form submits)
 * and shown to attendees in the venue's zone. When those two clocks differ, say so in plain words, with the result.
 */
function VenueTimeLine({ value, venueTz }: { value: DateTimeValue; venueTz?: string | null }) {
  if (!venueTz || !value.date || value.startMinutes === null) return null;
  const instant = new Date(`${value.date}T${formatMinutes24h(value.startMinutes)}:00`);
  if (Number.isNaN(instant.getTime())) return null;
  const yours = browserTz();
  const mine = splitClock(formatInTzWithZone(instant.toISOString(), yours));
  const theirs = splitClock(formatInTzWithZone(instant.toISOString(), venueTz));
  if (!mine || !theirs || (mine.day === theirs.day && mine.time === theirs.time)) return null;
  return (
    <p
      role="status"
      data-testid="venue-time-line"
      className="font-body-md text-body-md font-semibold text-on-surface"
    >
      You entered {mine.time} in your time ({yours}, {mine.zone}). This event will show {theirs.time}
      {theirs.day !== mine.day ? ` on ${theirs.day}` : ''} ({venueTz}, {theirs.zone}) to attendees.
    </p>
  );
}

// "01 Dec 2026, 09:00 (GMT+8)" -> day, time, zone label (formatInTzWithZone's shape).
function splitClock(s: string): { day: string; time: string; zone: string } | null {
  const m = /^(.+), (\d{2}:\d{2}) \((.+)\)$/.exec(s);
  return m ? { day: m[1]!, time: m[2]!, zone: m[3]! } : null;
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
