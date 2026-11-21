// The zone an accrediting body's deadlines are counted in, from its `jurisdiction` (Ivan 2026-11-21: derive, not stored).
// ponytail: one zone per country; Australia spans several, so AU uses Sydney. Add a column on accrediting_bodies if a body outside it needs its own.
const BY_JURISDICTION: Record<string, string> = {
  HK: 'Asia/Hong_Kong',
  AU: 'Australia/Sydney',
};

export function timezoneForJurisdiction(jurisdiction: string | null | undefined): string | null {
  return (jurisdiction && BY_JURISDICTION[jurisdiction.toUpperCase()]) || null;
}
