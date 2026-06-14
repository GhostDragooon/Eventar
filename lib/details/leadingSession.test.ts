import { describe, expect, it } from 'vitest';
import { deriveLeadingSession } from './leadingSession';

const block = (id: string, title: string) => ({ id, title });
const resp = (valuable_block_id: string | null, valuable_overall = false) => ({
  valuable_block_id,
  valuable_overall,
});

describe('deriveLeadingSession', () => {
  it('returns null when there are no responses', () => {
    expect(deriveLeadingSession([], [block('b1', 'Intro')])).toBeNull();
  });

  it('returns null when every response has a null block and no overall vote', () => {
    // Survey schema permits both fields to be null/false (Q2 not answered).
    // No signal => nothing to report.
    expect(
      deriveLeadingSession([resp(null, false), resp(null, false)], [block('b1', 'Intro')]),
    ).toBeNull();
  });

  it('returns the agenda block with the highest count', () => {
    const rows = [resp('b1'), resp('b2'), resp('b2'), resp('b1'), resp('b2')];
    const blocks = [block('b1', 'Welcome'), block('b2', 'Hands-on lab')];
    expect(deriveLeadingSession(rows, blocks)).toEqual({
      kind: 'block',
      id: 'b2',
      title: 'Hands-on lab',
    });
  });

  it('breaks ties by first-seen (insertion order in the response list)', () => {
    // b1 and b2 both at 2; b1 appears first in the response stream — it wins.
    const rows = [resp('b1'), resp('b2'), resp('b2'), resp('b1')];
    const blocks = [block('b2', 'Second'), block('b1', 'First')];
    expect(deriveLeadingSession(rows, blocks)).toEqual({
      kind: 'block',
      id: 'b1',
      title: 'First',
    });
  });

  it('returns the overall bucket when "General / overall" is the modal answer', () => {
    const rows = [
      resp(null, true),
      resp(null, true),
      resp(null, true),
      resp('b1', false),
    ];
    const blocks = [block('b1', 'Some block')];
    expect(deriveLeadingSession(rows, blocks)).toEqual({ kind: 'overall' });
  });

  it('a tie between a block and overall goes to the first-seen of the two', () => {
    // overall sits in row 0; block b1 in row 1; both end at 1. Overall wins.
    const rows = [resp(null, true), resp('b1', false)];
    const blocks = [block('b1', 'Block')];
    expect(deriveLeadingSession(rows, blocks)).toEqual({ kind: 'overall' });

    // Same counts but block seen first.
    const rows2 = [resp('b1', false), resp(null, true)];
    expect(deriveLeadingSession(rows2, blocks)).toEqual({
      kind: 'block',
      id: 'b1',
      title: 'Block',
    });
  });

  it('skips rows whose block id is no longer in the agenda (defensive)', () => {
    // If an organiser deletes an agenda block after the event, stale
    // valuable_block_id rows shouldn't render an empty title or crash.
    const rows = [resp('deleted'), resp('b1'), resp('b1')];
    const blocks = [block('b1', 'Live block')];
    expect(deriveLeadingSession(rows, blocks)).toEqual({
      kind: 'block',
      id: 'b1',
      title: 'Live block',
    });
  });

  it('returns null if the only votes reference deleted blocks', () => {
    const rows = [resp('gone'), resp('also-gone')];
    expect(deriveLeadingSession(rows, [block('b1', 'Live')])).toBeNull();
  });
});
