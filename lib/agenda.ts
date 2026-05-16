export type BlockTime = {
  id: string;
  start_time: string;    // ISO or HH:MM — only compared lexicographically when same prefix
  end_time: string;
};

/**
 * Returns the set of block IDs that overlap with at least one other block.
 * Adjacent blocks (one ends exactly when the next starts) are NOT considered parallel.
 */
export function findParallelBlockIds(blocks: BlockTime[]): Set<string> {
  const parallel = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      // Strict overlap: a.start < b.end AND b.start < a.end
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        parallel.add(a.id);
        parallel.add(b.id);
      }
    }
  }
  return parallel;
}
