import { describe, expect, it } from 'vitest';
import { sessionDistribution, OVERALL_SLUG } from './sessionDistribution';

const row = (valuable_block_id: string | null, valuable_overall = false) => ({
  valuable_block_id,
  valuable_overall,
});

const block = (id: string, title: string, host: string | null = null, topics: unknown = []) => ({
  id,
  title,
  host,
  topics,
});

describe('sessionDistribution', () => {
  it('returns an empty list when there are no Q2 answers', () => {
    expect(sessionDistribution([], [block('b1', 'Intro')])).toEqual([]);
  });

  it('returns an empty list when every row has neither overall nor block_id (Q2 unanswered)', () => {
    expect(
      sessionDistribution([row(null, false), row(null, false)], [block('b1', 'Intro')]),
    ).toEqual([]);
  });

  it('counts block hits + overall, labels with "{title} · {speaker}" + the overall bucket', () => {
    const rows = [
      row('b1'),
      row('b2'),
      row('b2'),
      row(null, true),
      row(null, true),
    ];
    const blocks = [
      block('b1', 'Welcome', 'Dr. Host'),
      block('b2', 'Hands-on lab', null, [{ speaker_name: 'Dr. Topic' }]),
    ];
    const result = sessionDistribution(rows, blocks);

    // Sort: descending by count, with overall acting like any other slug
    expect(result.map((r) => r.slug)).toEqual(['b2', OVERALL_SLUG, 'b1']);
    expect(result.find((r) => r.slug === 'b2')).toMatchObject({
      label: 'Hands-on lab · Dr. Topic',
      count: 2,
      pct: 40,
    });
    expect(result.find((r) => r.slug === OVERALL_SLUG)).toMatchObject({
      label: 'General sessions / overall',
      count: 2,
      pct: 40,
    });
    expect(result.find((r) => r.slug === 'b1')).toMatchObject({
      label: 'Welcome · Dr. Host',
      count: 1,
      pct: 20,
    });
  });

  it('ignores rows whose block_id has been deleted from the agenda (defensive)', () => {
    const rows = [row('deleted'), row('b1'), row('b1')];
    const blocks = [block('b1', 'Live block')];
    const result = sessionDistribution(rows, blocks);
    // Only "b1" counts; "deleted" doesn't even land in the denominator.
    expect(result).toEqual([
      { slug: 'b1', label: 'Live block · —', count: 2, pct: 100 },
    ]);
  });

  it('percentages are rounded integers and sum approximately to 100 across the answered rows', () => {
    const rows = [
      row('b1'),
      row('b1'),
      row('b1'),
      row(null, true),
    ];
    const blocks = [block('b1', 'Block A')];
    const result = sessionDistribution(rows, blocks);
    const sum = result.reduce((acc, r) => acc + r.pct, 0);
    expect(sum).toBe(100);
  });
});
