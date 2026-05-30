const FIFTEEN_MIN_MS = 15 * 60 * 1000;

type Row = { check_in_at: string | null };

export function arrivalLatency(rows: Row[], startTime: string): number | null {
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return null;
  let onTime = 0;
  let denom = 0;
  for (const row of rows) {
    if (row.check_in_at == null) continue;
    denom++;
    const diff = new Date(row.check_in_at).getTime() - startMs;
    if (diff <= FIFTEEN_MIN_MS) onTime++;
  }
  if (denom === 0) return null;
  return onTime / denom;
}
