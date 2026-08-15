import { describe, it, expect, vi, afterEach } from 'vitest';
import { priorApprovalDeadline } from './priorApproval';

// Fixed "now" so `passed` doesn't depend on the wall-clock date the test
// happens to run on (same discipline as lib/tz.test.ts's fixed reference
// date). All dates below are chosen relative to this instant.
const FIXED_NOW = new Date('2026-08-15T00:00:00.000Z');

describe('priorApprovalDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when cycle_config has no prior_approval key', () => {
    expect(priorApprovalDeadline('2026-12-01T09:00:00Z', {})).toBeNull();
    expect(priorApprovalDeadline('2026-12-01T09:00:00Z', { report_by_month: 9 })).toBeNull();
    expect(priorApprovalDeadline('2026-12-01T09:00:00Z', null)).toBeNull();
    expect(priorApprovalDeadline('2026-12-01T09:00:00Z', { _seed_placeholder: true })).toBeNull();
  });

  it('a date safely inside the window: not passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // HKCP: apply >=30 days before the event. Event is ~3.5 months out.
    const result = priorApprovalDeadline('2026-12-01T09:00:00Z', {
      prior_approval: { lead_time_days: 30, accepts_retrospective: false, applies_to: 'local', source: 'test' },
    });
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(false);
  });

  it('a date past the deadline: passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Event is only 5 days out — the 30-day-ahead application deadline is
    // already behind "now", and HKCP does not accept late local applications.
    const result = priorApprovalDeadline('2026-08-20T09:00:00Z', {
      prior_approval: { lead_time_days: 30, accepts_retrospective: false, applies_to: 'local', source: 'test' },
    });
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
  });

  it('retrospective-allowed: a negative lead_time_days puts the deadline after the event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Sourced from the same guideline cited in the HKCP migration: overseas
    // meetings are recognised up to 2 months (60 days) AFTER the event —
    // this shape isn't seeded to the DB (Eventar has no local/overseas event
    // classifier yet), only exercised here to prove the math generalises.
    const result = priorApprovalDeadline('2026-07-01T09:00:00Z', {
      prior_approval: {
        lead_time_days: -60,
        accepts_retrospective: true,
        applies_to: 'overseas',
        source: 'HKAM CME/CPD Guidelines, Cycle 2026-2028',
      },
    });
    expect(result).not.toBeNull();
    // The event already happened, but the 60-day-after grace window hasn't
    // closed yet as of FIXED_NOW — still not passed.
    expect(result!.passed).toBe(false);
    expect(result!.deadline.getTime()).toBeGreaterThan(new Date('2026-07-01T09:00:00Z').getTime());
  });

  it('anchors to the HKT calendar date, not the UTC one, across the day boundary', () => {
    // 00:30 HKT on 1 Oct 2026 is 16:30 UTC on 30 Sep 2026 — the previous
    // calendar day in UTC. The deadline must be computed against 1 Oct
    // (the HK calendar date), landing on 1 Sep 2026, not 31 Aug.
    const result = priorApprovalDeadline('2026-10-01T00:30:00+08:00', {
      prior_approval: { lead_time_days: 30, accepts_retrospective: false, applies_to: 'local', source: 'test' },
    });
    expect(result).not.toBeNull();
    // 23:59:59.999 HKT on 1 Sep 2026 = 15:59:59.999 UTC same day.
    expect(result!.deadline.toISOString()).toBe('2026-09-01T15:59:59.999Z');
  });
});
