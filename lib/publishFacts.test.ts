import { describe, expect, it } from 'vitest';
import { publishFacts } from './publishFacts';

// 2026-11-14 01:00Z is 09:00 in Hong Kong and 17:00 the evening before in Los Angeles.
const START = '2026-11-14T01:00:00.000Z';
const NOW = Date.parse('2026-10-01T00:00:00Z');

describe('publishFacts', () => {
  it('says registration opens now when no open time is set or it has already passed', () => {
    expect(publishFacts({ startIso: START, timezone: 'Asia/Hong_Kong', registrationOpenIso: null, nowMs: NOW }).registrationOpens).toBe('Registration opens now.');
    expect(publishFacts({ startIso: START, timezone: 'Asia/Hong_Kong', registrationOpenIso: '2026-09-01T00:00:00Z', nowMs: NOW }).registrationOpens).toBe('Registration opens now.');
  });

  it('names the scheduled open date, in the event timezone, when it is still ahead', () => {
    const f = publishFacts({ startIso: START, timezone: 'Asia/Hong_Kong', registrationOpenIso: '2026-10-20T01:30:00Z', nowMs: NOW });
    expect(f.registrationOpens).toBe('Registration opens on 20 Oct 2026, 09:30 (Asia/Hong_Kong).');
  });

  it('places check-in opening 60 minutes before the start, in the event timezone', () => {
    expect(publishFacts({ startIso: START, timezone: 'Asia/Hong_Kong', registrationOpenIso: null, nowMs: NOW }).checkinOpens)
      .toBe('Check-in opens at 14 Nov 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start.');
    // Not HKT: a Los Angeles event shows Los Angeles clock time (organiser location, never hard-coded).
    expect(publishFacts({ startIso: START, timezone: 'America/Los_Angeles', registrationOpenIso: null, nowMs: NOW }).checkinOpens)
      .toBe('Check-in opens at 13 Nov 2026, 16:00 (America/Los_Angeles), 60 minutes before the start.');
  });

  it('drops the clock time rather than guess a zone when none is known', () => {
    expect(publishFacts({ startIso: START, timezone: null, registrationOpenIso: null, nowMs: NOW }).checkinOpens)
      .toBe('Check-in opens 60 minutes before the start.');
  });

  it('says check-in is open now, not "opens at" a time in the past, when the start is under an hour away or past', () => {
    const f = (startIso: string) => publishFacts({ startIso, timezone: 'Asia/Hong_Kong', registrationOpenIso: null, nowMs: Date.parse('2026-11-14T00:30:00Z') }).checkinOpens;
    expect(f('2026-11-14T01:00:00.000Z')).toBe('Check-in is open now.'); // starts in 30 minutes
    expect(f('2026-11-13T01:00:00.000Z')).toBe('Check-in is open now.'); // already started
    expect(f('2026-11-14T02:00:00.000Z')).toMatch(/^Check-in opens at 14 Nov 2026, 09:00/); // 90 minutes away
  });

  it('does not claim registration opens now when it is scheduled but the zone is unknown', () => {
    expect(publishFacts({ startIso: START, timezone: null, registrationOpenIso: '2026-10-20T01:30:00Z', nowMs: NOW }).registrationOpens)
      .toBe('Registration opens on the date you set.');
  });
});
