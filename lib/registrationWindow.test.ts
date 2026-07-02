import { describe, expect, it } from 'vitest';
import { registrationWindow } from './registrationWindow';

describe('registrationWindow', () => {
  it('counts calendar days and excludes weekends from working days', () => {
    // Mon 2026-03-02 → Thu 2026-03-12 = 10 calendar days (Mon..Wed of next
    // week), containing one full weekend (Mar 7–8).
    const w = registrationWindow('2026-03-02T00:00:00Z', '2026-03-12T00:00:00Z')!;
    expect(w.calendarDays).toBe(10);
    expect(w.workingDays).toBe(8);
  });

  it('excludes HK public holidays from working days', () => {
    // 2026-06-29 (Mon) → 2026-07-06 (Mon) = 7 calendar days; weekend Jul 4–5
    // AND HKSAR Establishment Day Jul 1 (Wed) drop out.
    const w = registrationWindow('2026-06-29T00:00:00Z', '2026-07-06T00:00:00Z')!;
    expect(w.calendarDays).toBe(7);
    expect(w.workingDays).toBe(4);
  });

  it('returns null for missing or inverted bounds', () => {
    expect(registrationWindow(null, '2026-03-12T00:00:00Z')).toBeNull();
    expect(registrationWindow('2026-03-12T00:00:00Z', undefined)).toBeNull();
    expect(registrationWindow('2026-03-12T00:00:00Z', '2026-03-02T00:00:00Z')).toBeNull();
  });

  it('a sub-day window still reads as 1 calendar day', () => {
    const w = registrationWindow('2026-03-03T09:00:00Z', '2026-03-03T18:00:00Z')!;
    expect(w.calendarDays).toBe(1);
    expect(w.workingDays).toBe(1); // Tuesday
  });
});
