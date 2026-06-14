/**
 * Leading-session derivation for ED Section C (G1 replacement for the dead
 * "Latest highlight" quote). Counts the modal answer to survey Q2 and joins
 * to agenda block titles. The "General sessions / overall" fallback (Q2
 * answered as "general") competes with the named-block options.
 *
 * Pure function — no DB calls, no I/O. Caller fetches the rows + blocks and
 * passes them in. Keeps the page Server Component simple.
 */
export type SurveyValuableRow = {
  valuable_block_id: string | null;
  valuable_overall: boolean | null;
};

export type AgendaBlockTitle = { id: string; title: string };

export type LeadingSession =
  | { kind: 'block'; id: string; title: string }
  | { kind: 'overall' };

export function deriveLeadingSession(
  rows: readonly SurveyValuableRow[],
  blocks: readonly AgendaBlockTitle[],
): LeadingSession | null {
  const titleById = new Map(blocks.map((b) => [b.id, b.title]));

  // Tally + remember the first index each candidate was seen at, for
  // deterministic tie-breaking (first-seen wins — see test).
  type Tally = { count: number; firstSeen: number };
  const blockTally = new Map<string, Tally>();
  let overall: Tally | null = null;

  rows.forEach((row, idx) => {
    if (row.valuable_overall) {
      if (overall === null) overall = { count: 1, firstSeen: idx };
      else overall.count += 1;
      return;
    }
    if (row.valuable_block_id && titleById.has(row.valuable_block_id)) {
      const existing = blockTally.get(row.valuable_block_id);
      if (existing) existing.count += 1;
      else blockTally.set(row.valuable_block_id, { count: 1, firstSeen: idx });
    }
  });

  // Pick the best candidate. Higher count wins; ties go to the lower firstSeen.
  type Candidate = { kind: 'block' | 'overall'; id?: string; tally: Tally };
  const candidates: Candidate[] = [];
  for (const [id, tally] of blockTally) candidates.push({ kind: 'block', id, tally });
  if (overall) candidates.push({ kind: 'overall', tally: overall });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.tally.count !== a.tally.count) return b.tally.count - a.tally.count;
    return a.tally.firstSeen - b.tally.firstSeen;
  });

  const winner = candidates[0];
  if (winner.kind === 'overall') return { kind: 'overall' };
  // Non-null assertion: titleById.has() was checked above before adding to tally.
  return { kind: 'block', id: winner.id!, title: titleById.get(winner.id!)! };
}
