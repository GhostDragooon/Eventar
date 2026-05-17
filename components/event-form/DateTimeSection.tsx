'use client';

import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { deriveEnd, type Duration } from '@/lib/time';

// 30-min increments, 06:00–22:00 inclusive (33 slots).
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h !== 22) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

const DURATIONS: { value: Duration; label: string }[] = [
  { value: '30m',    label: '30m' },
  { value: '1h',     label: '1h'  },
  { value: '2h',     label: '2h'  },
  { value: '4h',     label: '4h'  },
  { value: '8h',     label: '8h'  },
  { value: 'custom', label: 'custom' },
];

export type DateTimeValue = {
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  duration: Duration;
  customEnd: string;   // HH:MM, used only when duration === 'custom'
};

type Props = {
  value: DateTimeValue;
  onChange: (patch: Partial<DateTimeValue>) => void;
};

export default function DateTimeSection({ value, onChange }: Props) {
  const endTime = deriveEnd(value.startTime, value.duration, value.customEnd);

  return (
    <div className="space-y-5">
      {/* Date */}
      <label className="block">
        <span className="block text-sm font-medium mb-1">Date</span>
        <Input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-auto"
        />
      </label>

      {/* Start time */}
      <div>
        <span className="block text-sm font-medium mb-2">Start time</span>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <ToggleGroup
            type="single"
            value={value.startTime}
            onValueChange={(v) => v && onChange({ startTime: v })}
            className="inline-flex gap-1"
          >
            {TIME_SLOTS.map((slot) => (
              <ToggleGroupItem key={slot} value={slot} className="px-3">
                {slot}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Duration */}
      <div>
        <span className="block text-sm font-medium mb-2">Duration</span>
        <ToggleGroup
          type="single"
          value={value.duration}
          onValueChange={(v) => v && onChange({ duration: v as Duration })}
          className="inline-flex gap-1"
        >
          {DURATIONS.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value} className="px-3">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {value.duration === 'custom' && (
          <label className="block mt-3">
            <span className="block text-sm font-medium mb-1">Custom end time</span>
            <Input
              type="time"
              value={value.customEnd}
              onChange={(e) => onChange({ customEnd: e.target.value })}
              className="w-auto"
            />
          </label>
        )}

        {endTime && value.startTime && (
          <p className="text-sm text-gray-600 mt-2">→ Ends {endTime}</p>
        )}
      </div>
    </div>
  );
}

export function dateTimeSummary(v: DateTimeValue): string {
  const end = deriveEnd(v.startTime, v.duration, v.customEnd);
  if (!v.date || !v.startTime || !end) return 'Not set';
  return `${formatDateShort(v.date)}, ${v.startTime}–${end} (${v.duration})`;
}

export function dateTimeValid(v: DateTimeValue): boolean {
  const end = deriveEnd(v.startTime, v.duration, v.customEnd);
  return Boolean(v.date) && Boolean(v.startTime) && Boolean(end) && end > v.startTime;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
