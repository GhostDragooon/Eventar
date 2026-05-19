'use client';

import { Input } from '@/components/ui/input';
import {
  reduceTimeRange, formatHour, durationLabel,
  type TimeRangeState,
} from '@/lib/time-range';

// 1-hour chips, 08:00 → 20:00 inclusive (13 slots).
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

export type DateTimeValue = {
  date: string;                  // YYYY-MM-DD
  startHour: number | null;      // 8..20, or null
  endHour: number | null;        // 8..20, or null
};

type Props = {
  value: DateTimeValue;
  onChange: (patch: Partial<DateTimeValue>) => void;
};

export default function DateTimeSection({ value, onChange }: Props) {
  const range: TimeRangeState = [value.startHour, value.endHour];
  const [start, end] = range;

  function clickHour(h: number) {
    const [s, e] = reduceTimeRange(range, h);
    onChange({ startHour: s, endHour: e });
  }

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="block text-sm font-medium mb-1 text-gray-900">Date</span>
        <Input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-auto"
        />
      </label>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">Time</span>
          <RangeReadout start={start} end={end} />
        </div>
        <TimePill hours={HOURS} start={start} end={end} onClick={clickHour} />
        <p className="text-xs text-gray-500 mt-2">
          {start === null
            ? 'Tap a chip to set the start time.'
            : end === null
            ? 'Tap another chip to set the end time. Tap the same chip to clear.'
            : 'Tap an end chip to clear, or any other chip to restart.'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Times are in your local timezone. The event page will display them in
          the venue&apos;s local time.
        </p>
      </div>
    </div>
  );
}

function RangeReadout({ start, end }: { start: number | null; end: number | null }) {
  if (start === null) return null;
  if (end === null) {
    return <span className="text-sm text-gray-600">Start: {formatHour(start)}</span>;
  }
  return (
    <span className="text-sm text-gray-700">
      {formatHour(start)}–{formatHour(end)} · <strong>{durationLabel(start, end)}</strong>
    </span>
  );
}

function TimePill({
  hours, start, end, onClick,
}: {
  hours: number[];
  start: number | null;
  end: number | null;
  onClick: (h: number) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
        {hours.map((h, i) => {
          const isStart = h === start;
          const isEnd   = h === end;
          const isInside = start !== null && end !== null && h > start && h < end;
          const isSelected = isStart || isEnd || isInside;

          return (
            <button
              key={h}
              type="button"
              onClick={() => onClick(h)}
              aria-pressed={isSelected}
              className={[
                'px-3 py-2 text-sm transition-colors',
                i !== 0 && 'border-l border-gray-300',
                isSelected
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
                isStart && 'rounded-l-md',
                isEnd   && 'rounded-r-md',
              ].filter(Boolean).join(' ')}
            >
              {h}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============== exports consumed by app/events/new/page.tsx ============== */

export function dateTimeSummary(v: DateTimeValue): string {
  if (!v.date || v.startHour === null || v.endHour === null) return 'Not set';
  return `${formatDateShort(v.date)}, ${formatHour(v.startHour)}–${formatHour(v.endHour)} (${durationLabel(v.startHour, v.endHour)})`;
}

export function dateTimeValid(v: DateTimeValue): boolean {
  return Boolean(v.date) && v.startHour !== null && v.endHour !== null && v.endHour > v.startHour;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
