import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { eventInputSchema, blockInputSchema } from './actions';

const validEvent = {
  title: 'Internal Workshop',
  description: 'A test event',
  start_time: '2026-06-15T09:00:00.000Z',
  end_time:   '2026-06-15T16:00:00.000Z',
  venue_name: 'Rosewood Sand Hill',
  venue_address: '2825 Sand Hill Rd',
  city: 'Menlo Park',
  region: 'California',
  country: 'United States',
  latitude: 37.4123,
  longitude: -122.2007,
};

describe('eventInputSchema', () => {
  it('accepts a valid event', () => {
    expect(eventInputSchema.safeParse(validEvent).success).toBe(true);
  });
  it('rejects empty title', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, title: '' }).success).toBe(false);
  });
  it('rejects end before start', () => {
    const bad = { ...validEvent, end_time: '2026-06-15T08:00:00.000Z' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects missing venue_name (strict v1)', () => {
    const { venue_name, ...rest } = validEvent;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects out-of-range latitude', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, latitude: 95 }).success).toBe(false);
  });
  it('coerces optional max_attendees', () => {
    const r = eventInputSchema.safeParse({ ...validEvent, max_attendees: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_attendees).toBe(50);
  });
});

describe('blockInputSchema', () => {
  const validBlock = {
    start_time: '2026-06-15T09:00:00.000Z',
    end_time:   '2026-06-15T10:00:00.000Z',
    kind: 'workshop' as const,
    title: 'Intro',
    topics: [{
      title: 'Why test-first?',
      speaker_name: 'Jane Doe',
      speaker_credential: 'Sr. Engineer',
      speaker_affiliation: 'Acme Co',
    }],
  };
  it('accepts a valid workshop block', () => {
    expect(blockInputSchema.safeParse(validBlock).success).toBe(true);
  });
  it('rejects break with non-empty topics', () => {
    const bad = { ...validBlock, kind: 'break' as const };
    expect(blockInputSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts break with empty topics', () => {
    const ok = { ...validBlock, kind: 'break' as const, topics: [] };
    expect(blockInputSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects invalid kind', () => {
    expect(blockInputSchema.safeParse({ ...validBlock, kind: 'banana' as any }).success).toBe(false);
  });
});
