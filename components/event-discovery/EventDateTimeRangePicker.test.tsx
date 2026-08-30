/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EventDateTimeRangePicker,
  validateDateTimeRange,
} from './EventDateTimeRangePicker';

afterEach(cleanup);

const base = { startDate: '2026-08-20', startTime: 9 * 60, endDate: '', endTime: null };

describe('validateDateTimeRange', () => {
  it('allows an incomplete range without erroring', () => {
    expect(validateDateTimeRange(base)).toBeNull();
  });

  it('rejects an end date before the start date', () => {
    expect(
      validateDateTimeRange({ ...base, endDate: '2026-08-19', endTime: 10 * 60 }),
    ).toBe('End date must be on or after the start date.');
  });

  it('rejects an inverted date range before either time has been chosen', () => {
    expect(
      validateDateTimeRange({ startDate: '2026-08-20', startTime: null, endDate: '2026-08-19', endTime: null }),
    ).toBe('End date must be on or after the start date.');
  });

  it('rejects an end time at or before the start time on the same day', () => {
    expect(
      validateDateTimeRange({ ...base, endDate: '2026-08-20', endTime: 9 * 60 }),
    ).toBe('End time must be after the start time on the same day.');
    expect(
      validateDateTimeRange({ ...base, endDate: '2026-08-20', endTime: 8 * 60 }),
    ).toBe('End time must be after the start time on the same day.');
  });

  it('accepts a same-day range where end is after start', () => {
    expect(
      validateDateTimeRange({ ...base, endDate: '2026-08-20', endTime: 17 * 60 }),
    ).toBeNull();
  });

  it('accepts an overnight range spanning into a later day regardless of time-of-day', () => {
    expect(
      validateDateTimeRange({ ...base, startTime: 22 * 60, endDate: '2026-08-21', endTime: 2 * 60 }),
    ).toBeNull();
  });
});

describe('EventDateTimeRangePicker', () => {
  const inverting = { startDate: '2026-08-10', startTime: null, endDate: '2026-08-19', endTime: null };

  it('keeps the end date the user typed when the start date moves past it', () => {
    const onChange = vi.fn();
    render(<EventDateTimeRangePicker value={inverting} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start date' }));
    fireEvent.click(screen.getByRole('button', { name: new Date(2026, 7, 25).toDateString() }));

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-08-25',
      startTime: null,
      endDate: '2026-08-19',
      endTime: null,
    });
  });

  it('announces the resulting conflict instead of resolving it silently', () => {
    render(
      <EventDateTimeRangePicker
        value={{ ...inverting, startDate: '2026-08-25' }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date.');
    expect(screen.getByRole('button', { name: 'End date' })).toHaveAttribute('data-invalid', 'true');
  });
});
