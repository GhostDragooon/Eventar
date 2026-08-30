'use client';

import type { ReactNode } from 'react';
import { DatePicker } from '@/components/event-form/DatePicker';
import { TimePicker15 } from '@/components/event-form/TimePicker15';

export type EventDateTimeRangeValue = {
  startDate: string; // ISO YYYY-MM-DD, or empty
  startTime: number | null; // minutes since midnight
  endDate: string;
  endTime: number | null;
};

type Props = {
  value: EventDateTimeRangeValue;
  onChange: (value: EventDateTimeRangeValue) => void;
};

/**
 * Cross-day range validation: same-day requires end > start; a later end
 * date is always valid regardless of the time-of-day pair (overnight and
 * multi-day events are legitimate).
 *
 * Date order is checked before the completeness guard: it needs only the two
 * dates, so an inverted range surfaces the moment the second date is picked
 * rather than staying invisible until both times are filled in.
 */
export function validateDateTimeRange({
  startDate,
  startTime,
  endDate,
  endTime,
}: EventDateTimeRangeValue): string | null {
  if (startDate && endDate && endDate < startDate) {
    return 'End date must be on or after the start date.';
  }
  if (!startDate || !endDate || startTime === null || endTime === null) return null;
  if (endDate === startDate && endTime <= startTime) {
    return 'End time must be after the start time on the same day.';
  }
  return null;
}

export function EventDateTimeRangePicker({ value, onChange }: Props) {
  const error = validateDateTimeRange(value);

  return (
    <div className="space-y-md">
      <div className="grid gap-md sm:grid-cols-2">
        <Labelled label="Start date">
          {/* A start date that lands after the end date is left exactly as
              both were typed — the range error below reports the conflict
              instead of the component quietly rewriting the end date. */}
          <DatePicker
            value={value.startDate}
            onChange={(startDate) => onChange({ ...value, startDate })}
            ariaLabel="Start date"
          />
        </Labelled>
        <Labelled label="Start time">
          <TimePicker15
            value={value.startTime}
            onChange={(startTime) => onChange({ ...value, startTime })}
            ariaLabel="Start time"
          />
        </Labelled>
        <Labelled label="End date">
          <DatePicker
            value={value.endDate}
            onChange={(endDate) => onChange({ ...value, endDate })}
            invalid={Boolean(error)}
            ariaLabel="End date"
          />
        </Labelled>
        <Labelled label="End time">
          <TimePicker15
            value={value.endTime}
            onChange={(endTime) => onChange({ ...value, endTime })}
            invalid={Boolean(error)}
            ariaLabel="End time"
          />
        </Labelled>
      </div>

      {error && (
        // role="alert" so the conflict is announced when it appears, not just
        // drawn (matches CreateEventWizard's basics error).
        <p role="alert" className="font-body-md text-body-md text-error flex items-center gap-xs">
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>
            warning
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
        {label}
      </span>
      {children}
    </label>
  );
}
