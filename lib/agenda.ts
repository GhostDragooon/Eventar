export type BlockTime = {
  id: string;
  start_time: string;    // ISO or HH:MM — only compared lexicographically when same prefix
  end_time: string;
};

// Shape of a single entry inside agenda_blocks.topics (jsonb). Mirrors
// topicSchema in app/events/new/actions.ts at the type level; read-side
// callers (edit + public pages) use this to render speaker rows without
// `any`.
export type AgendaTopic = {
  title: string;
  speaker_name: string;
  speaker_credential?: string;
  speaker_affiliation?: string;
};

/**
 * Breaks/transitions are schedule filler, not "sessions" — they must never be
 * survey Q2 options (render side) nor accepted as valuable_block_id (action
 * side). Single predicate so the two filters can't drift.
 */
export function isSessionBlockKind(kind: string): boolean {
  return kind !== 'break' && kind !== 'transition';
}

// Minimal block shape needed to derive the speaker list. `kind` is accepted
// (so callers can pass full block rows) but deliberately ignored — see
// deriveSpeakerNames.
export type SpeakerSourceBlock = {
  kind?: string;
  host: string | null;
  topics: unknown;
};

/**
 * G3 speaker check-in: derive the event's speaker list from its agenda blocks
 * — block `host` + each topic's `speaker_name`, trimmed, deduped on the exact
 * trimmed string, first-seen order. NO kind filter (unlike isSessionBlockKind):
 * per the redesign plan a break/transition hosted by a person still puts them
 * on stage, so their host counts as a speaker. Single derivation point shared
 * by the toggle action (server-side recompute) and the Team-Checkin page so
 * the two lists can't drift.
 */
export function deriveSpeakerNames(blocks: SpeakerSourceBlock[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const name = raw.trim();
    if (name === '' || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  for (const block of blocks) {
    add(block.host);
    // topics is untyped jsonb: entries may be primitives/null, so narrow each
    // one instead of asserting AgendaTopic[] — add() ignores non-strings.
    const topics: unknown[] = Array.isArray(block.topics) ? block.topics : [];
    for (const topic of topics) {
      add(
        typeof topic === 'object' && topic !== null
          ? (topic as { speaker_name?: unknown }).speaker_name
          : undefined,
      );
    }
  }
  return names;
}

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
