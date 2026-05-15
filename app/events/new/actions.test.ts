import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { eventInputSchema } from './actions';

describe('eventInputSchema', () => {
  const base = {
    title: 'Intro to TDD',
    start_time: '2026-06-15T09:00:00.000Z',
    end_time:   '2026-06-15T10:30:00.000Z',
    timezone:   'Europe/Berlin',
  };
  it('accepts a minimal valid input', () => {
    expect(eventInputSchema.safeParse(base).success).toBe(true);
  });
  it('rejects end before start', () => {
    const bad = { ...base, end_time: '2026-06-15T08:00:00.000Z' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects empty title', () => {
    expect(eventInputSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
  it('rejects bad timezone', () => {
    expect(eventInputSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
  });
});
