/**
 * E.5 Q2 distribution labels. Each agenda block surfaces in the analytics
 * "Most valuable session" slice as "{title} · {speaker_name or '—'}".
 *
 * Speaker = block.host if set, else the first topic's speaker_name. Mirrors
 * `deriveSpeakerNames` (lib/agenda.ts) in spirit but only returns one
 * representative — this is a chart label, not a roster.
 */
export type LabelSourceBlock = {
  title: string;
  host: string | null;
  // jsonb at the DB layer, so callers may pass arbitrary shapes; we narrow.
  topics: unknown;
};

const SPEAKER_PLACEHOLDER = '—';

const trimOrNull = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

export function speakerForBlock(block: Omit<LabelSourceBlock, 'title'>): string | null {
  const host = trimOrNull(block.host);
  if (host) return host;

  const topics: unknown[] = Array.isArray(block.topics) ? block.topics : [];
  for (const topic of topics) {
    if (typeof topic !== 'object' || topic === null) continue;
    const name = trimOrNull((topic as { speaker_name?: unknown }).speaker_name);
    if (name) return name;
  }
  return null;
}

export function labelForBlock(block: LabelSourceBlock): string {
  const speaker = speakerForBlock(block) ?? SPEAKER_PLACEHOLDER;
  return `${block.title} · ${speaker}`;
}
