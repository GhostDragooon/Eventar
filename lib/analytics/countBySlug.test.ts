import { describe, expect, it } from 'vitest';
import { countBySlug } from './countBySlug';

type Row = { session_format: string | null };

const labels: Record<string, string> = {
  scientific_presentations: 'Scientific Presentations',
  clinical_panels: 'Clinical Panel Discussions',
  interactive_qa: 'Interactive Q&A Sessions',
  peer_networking: 'Peer Networking',
};

describe('countBySlug', () => {
  it('returns empty array for empty rows', () => {
    expect(countBySlug<Row, 'session_format'>([], 'session_format', labels)).toEqual([]);
  });

  it('ignores null values in the count + denominator', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: null },
      { session_format: 'peer_networking' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    const top = out.find((r) => r.slug === 'peer_networking');
    expect(top?.count).toBe(2);
    expect(top?.pct).toBe(100); // 2 of 2 non-null
  });

  it('sorts descending by count', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'scientific_presentations' },
      { session_format: 'scientific_presentations' },
      { session_format: 'interactive_qa' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out.map((r) => r.slug)).toEqual(['peer_networking', 'scientific_presentations', 'interactive_qa']);
  });

  it('rounds percent to nearest integer', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'scientific_presentations' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out[0].pct).toBe(67);
    expect(out[1].pct).toBe(33);
  });

  it('includes label from the labels map; falls back to slug if missing', () => {
    const rows: Row[] = [{ session_format: 'peer_networking' }, { session_format: 'unknown_slug' }];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out.find((r) => r.slug === 'peer_networking')?.label).toBe('Peer Networking');
    expect(out.find((r) => r.slug === 'unknown_slug')?.label).toBe('unknown_slug');
  });
});
