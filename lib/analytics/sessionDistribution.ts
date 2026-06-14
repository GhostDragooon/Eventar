/**
 * E.5 Q2 "Most valuable session" aggregation. Survey schema lets a respondent
 * either:
 *   - flag a specific agenda block via `valuable_block_id` (FK), or
 *   - flag the day overall via `valuable_overall` boolean.
 *
 * This helper rolls up both into a `Distribution[]` that the
 * SessionDistributionSlice renders. The "overall" bucket competes with the
 * named blocks; rows that point at a deleted block are dropped (defensive,
 * matches deriveLeadingSession semantics).
 */
import type { Distribution } from './countBySlug';
import { labelForBlock, type LabelSourceBlock } from './labelForBlock';

export const OVERALL_SLUG = '__overall__';
const OVERALL_LABEL = 'General sessions / overall';

export type SessionDistributionRow = {
  valuable_block_id: string | null;
  valuable_overall: boolean | null;
};

export type SessionDistributionBlock = LabelSourceBlock & { id: string };

export function sessionDistribution(
  rows: readonly SessionDistributionRow[],
  blocks: readonly SessionDistributionBlock[],
): Distribution[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const counts = new Map<string, number>();
  let denom = 0;
  for (const row of rows) {
    if (row.valuable_overall) {
      counts.set(OVERALL_SLUG, (counts.get(OVERALL_SLUG) ?? 0) + 1);
      denom++;
      continue;
    }
    if (row.valuable_block_id && byId.has(row.valuable_block_id)) {
      counts.set(row.valuable_block_id, (counts.get(row.valuable_block_id) ?? 0) + 1);
      denom++;
    }
  }
  if (denom === 0) return [];

  return [...counts.entries()]
    .map(([slug, count]): Distribution => {
      const label = slug === OVERALL_SLUG
        ? OVERALL_LABEL
        : labelForBlock(byId.get(slug)!);
      return { slug, label, count, pct: Math.round((count / denom) * 100) };
    })
    .sort((a, b) => b.count - a.count);
}
