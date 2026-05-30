import type { Distribution } from './countBySlug';

export function countBySlugMulti<TRow, TKey extends keyof TRow>(
  rows: TRow[],
  key: TKey,
  labels: Record<string, string>,
): Distribution[] {
  const counts = new Map<string, number>();
  let responders = 0;
  for (const row of rows) {
    const arr = row[key] as unknown as string[] | null | undefined;
    if (!arr || arr.length === 0) continue;
    responders++;
    for (const slug of arr) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  if (responders === 0) return [];
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: labels[slug] ?? slug,
      count,
      pct: Math.round((count / responders) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
