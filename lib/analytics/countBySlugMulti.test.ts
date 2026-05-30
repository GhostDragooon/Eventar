import { describe, expect, it } from 'vitest';
import { countBySlugMulti } from './countBySlugMulti';

type Row = { future_preferences: string[] };

const labels: Record<string, string> = {
  expanded_qa: 'Expanded Interactive Q&A',
  increased_clinical_depth: 'Increased Clinical Depth',
  structured_networking: 'Structured Networking',
  subspecialty_topics: 'Diverse Sub-specialty Topics',
};

describe('countBySlugMulti', () => {
  it('returns empty array for empty rows', () => {
    expect(countBySlugMulti<Row, 'future_preferences'>([], 'future_preferences', labels)).toEqual([]);
  });

  it('ignores rows with empty array in the denominator', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking'] },
      { future_preferences: [] },
      { future_preferences: ['structured_networking', 'expanded_qa'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    const top = out.find((r) => r.slug === 'structured_networking');
    expect(top?.count).toBe(2);
    expect(top?.pct).toBe(100); // 2 of 2 non-empty responders picked it
  });

  it('percents can sum > 100% (multi-select semantics)', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking', 'expanded_qa'] },
      { future_preferences: ['structured_networking', 'increased_clinical_depth'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    const sum = out.reduce((s, r) => s + r.pct, 0);
    expect(sum).toBeGreaterThan(100);
  });

  it('sorts descending by count', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking'] },
      { future_preferences: ['structured_networking', 'expanded_qa'] },
      { future_preferences: ['structured_networking', 'increased_clinical_depth'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    expect(out[0].slug).toBe('structured_networking');
  });
});
