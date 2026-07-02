// Registration-window day counter (editor v4, locked 2026-06-20):
// `Registration window · N calendar days · M working days`. Working days
// exclude weekends AND Hong Kong public holidays.
//
// OPEN QUESTION (flagged in the vault): for non-HK venues, which region's
// holiday calendar applies? Until decided, HK is the only calendar — matches
// today's single-region usage.

// HK general holidays 2026 (Gazette). Static table by design: a holidays API
// is an external service this phase doesn't add. Extend year-by-year.
const HK_PUBLIC_HOLIDAYS = new Set([
  '2026-01-01', // New Year's Day
  '2026-02-17', '2026-02-18', '2026-02-19', // Lunar New Year
  '2026-04-03', '2026-04-04', '2026-04-06', '2026-04-07', // Ching Ming + Easter
  '2026-05-01', // Labour Day
  '2026-05-24', '2026-05-25', // Buddha's Birthday (+ following day)
  '2026-06-19', // Tuen Ng
  '2026-07-01', // HKSAR Establishment Day
  '2026-09-26', // Day after Mid-Autumn
  '2026-10-01', // National Day
  '2026-10-19', // Chung Yeung
  '2026-12-25', '2026-12-26', // Christmas
]);

const DAY_MS = 86_400_000;

function ymdUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type RegistrationWindow = {
  calendarDays: number;
  workingDays: number;
};

/**
 * Inclusive-of-start, exclusive-of-end day counts between two instants.
 * Returns null when either bound is missing or the range is inverted.
 */
export function registrationWindow(
  openIso: string | null | undefined,
  closeIso: string | null | undefined,
): RegistrationWindow | null {
  if (!openIso || !closeIso) return null;
  const openMs = new Date(openIso).getTime();
  const closeMs = new Date(closeIso).getTime();
  if (Number.isNaN(openMs) || Number.isNaN(closeMs) || closeMs <= openMs) return null;

  const calendarDays = Math.max(1, Math.ceil((closeMs - openMs) / DAY_MS));

  let workingDays = 0;
  for (let i = 0; i < calendarDays; i++) {
    const dayMs = openMs + i * DAY_MS;
    const dow = new Date(dayMs).getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend
    if (HK_PUBLIC_HOLIDAYS.has(ymdUtc(dayMs))) continue;
    workingDays++;
  }
  return { calendarDays, workingDays };
}
