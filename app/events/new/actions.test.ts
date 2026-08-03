import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { eventInputSchema, blockInputSchema } from './schema';

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
  it('rejects end equal to start', () => {
    const bad = { ...validEvent, end_time: validEvent.start_time };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects missing venue_name', () => {
    const { venue_name, ...rest } = validEvent;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects missing city', () => {
    const { city, ...rest } = validEvent;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects missing country', () => {
    const { country, ...rest } = validEvent;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects out-of-range latitude', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, latitude: 95 }).success).toBe(false);
  });
  it('rejects out-of-range longitude', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, longitude: 181 }).success).toBe(false);
  });
  it('coerces optional max_attendees', () => {
    const r = eventInputSchema.safeParse({ ...validEvent, max_attendees: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_attendees).toBe(50);
  });

  // Check-in modes. The default has to match events.checkin_modes' column
  // default exactly, because every pre-existing caller (seed scripts, the
  // RLS fixtures, older tests) omits the key — if Zod's default drifted from
  // the column's, a no-edit Save would silently change how the door works.
  it('defaults checkin_modes to staff-only when the key is absent', () => {
    const r = eventInputSchema.safeParse(validEvent);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.checkin_modes).toEqual({ staff: true, self_serve: false });
  });
  it('accepts self-serve check-in enabled', () => {
    const r = eventInputSchema.safeParse({
      ...validEvent,
      checkin_modes: { staff: true, self_serve: true },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.checkin_modes.self_serve).toBe(true);
  });
  it('rejects a non-boolean self_serve', () => {
    // The confirm page tests `checkin_modes?.self_serve === true`, so a
    // truthy-but-not-true value ("yes") would read as OFF forever with no
    // error anywhere — rule 12. Layer 2 rejects it; the DB CHECK is layer 3.
    const r = eventInputSchema.safeParse({
      ...validEvent,
      checkin_modes: { staff: true, self_serve: 'yes' },
    });
    expect(r.success).toBe(false);
  });
  it('rejects a checkin_modes object missing self_serve', () => {
    const r = eventInputSchema.safeParse({ ...validEvent, checkin_modes: { staff: true } });
    expect(r.success).toBe(false);
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
  it('rejects block end before start', () => {
    const bad = { ...validBlock, end_time: '2026-06-15T08:00:00.000Z' };
    expect(blockInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects block end equal to start', () => {
    const bad = { ...validBlock, end_time: validBlock.start_time };
    expect(blockInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects break with non-empty topics', () => {
    const bad = { ...validBlock, kind: 'break' as const };
    expect(blockInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects transition with non-empty topics', () => {
    const bad = { ...validBlock, kind: 'transition' as const };
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
