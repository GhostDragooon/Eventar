export type Distribution = {
  slug: string;
  label: string;
  count: number;
  pct: number;
};

export function countBySlug<TRow, TKey extends keyof TRow>(
  rows: TRow[],
  key: TKey,
  labels: Record<string, string>,
): Distribution[] {
  const counts = new Map<string, number>();
  let denom = 0;
  for (const row of rows) {
    const value = row[key];
    if (value == null) continue;
    const slug = String(value);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    denom++;
  }
  if (denom === 0) return [];
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: labels[slug] ?? slug,
      count,
      pct: Math.round((count / denom) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
