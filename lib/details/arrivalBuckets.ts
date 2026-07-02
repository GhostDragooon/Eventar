// Arrivals histogram for the Event Manager Attendance section (Design Session
// Log — "Arrivals per 5 min · since door open · peak HH:MM · N arrivals").
//
// Buckets check-in timestamps from door-open to `untilMs`. 5-minute buckets by
// default; for long spans the bucket widens to keep the bar count readable.

export type ArrivalHistogram = {
  buckets: number[];
  bucketMinutes: number;
  peakIndex: number | null; // null when no arrivals
  peakCount: number;
};

const MAX_BUCKETS = 48;

export function arrivalBuckets(
  checkIns: (string | null)[],
  doorOpenMs: number,
  untilMs: number,
): ArrivalHistogram {
  const spanMs = Math.max(0, untilMs - doorOpenMs);
  let bucketMinutes = 5;
  while (spanMs / (bucketMinutes * 60_000) > MAX_BUCKETS) bucketMinutes *= 2;

  const count = Math.max(1, Math.ceil(spanMs / (bucketMinutes * 60_000)));
  const buckets = new Array<number>(count).fill(0);

  for (const iso of checkIns) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t) || t < doorOpenMs || t > untilMs) continue;
    const i = Math.min(count - 1, Math.floor((t - doorOpenMs) / (bucketMinutes * 60_000)));
    buckets[i] += 1;
  }

  let peakIndex: number | null = null;
  let peakCount = 0;
  buckets.forEach((n, i) => {
    if (n > peakCount) {
      peakCount = n;
      peakIndex = i;
    }
  });

  return { buckets, bucketMinutes, peakIndex, peakCount };
}
