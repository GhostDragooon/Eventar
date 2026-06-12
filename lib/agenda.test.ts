import { describe, expect, it } from 'vitest';
import {
  deriveSpeakerNames,
  findParallelBlockIds,
  type BlockTime,
  type SpeakerSourceBlock,
} from './agenda';

describe('findParallelBlockIds', () => {
  const b = (id: string, start: string, end: string): BlockTime => ({
    id, start_time: start, end_time: end,
  });

  it('returns empty set when no overlaps', () => {
    const blocks = [b('1', '09:00', '10:00'), b('2', '10:00', '11:00')];
    expect(findParallelBlockIds(blocks).size).toBe(0);
  });

  it('flags both blocks when two overlap', () => {
    const blocks = [b('1', '09:00', '10:30'), b('2', '10:00', '11:00')];
    const par = findParallelBlockIds(blocks);
    expect(par.has('1')).toBe(true);
    expect(par.has('2')).toBe(true);
  });

  it('does not flag adjacent (back-to-back) blocks', () => {
    // 9-10 and 10-11 are NOT parallel (touch at endpoint, no overlap)
    const blocks = [b('1', '09:00', '10:00'), b('2', '10:00', '11:00')];
    expect(findParallelBlockIds(blocks).size).toBe(0);
  });

  it('flags three-way overlap', () => {
    const blocks = [
      b('1', '09:00', '11:00'),
      b('2', '10:00', '12:00'),
      b('3', '10:30', '11:30'),
    ];
    const par = findParallelBlockIds(blocks);
    expect(par.size).toBe(3);
  });
});

describe('deriveSpeakerNames', () => {
  const blk = (host: string | null, topics: unknown): SpeakerSourceBlock => ({
    kind: 'talk',
    host,
    topics,
  });

  it('collects block hosts and topic speaker names in first-seen order', () => {
    const blocks = [
      blk('Ada Lovelace', [
        { title: 'T1', speaker_name: 'Grace Hopper' },
        { title: 'T2', speaker_name: 'Alan Turing' },
      ]),
      blk('Edsger Dijkstra', []),
    ];
    expect(deriveSpeakerNames(blocks)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Alan Turing',
      'Edsger Dijkstra',
    ]);
  });

  it('dedupes on the exact trimmed name string', () => {
    const blocks = [
      blk(' Ada Lovelace ', [{ title: 'T', speaker_name: 'Ada Lovelace' }]),
      blk('Ada Lovelace', [{ title: 'T2', speaker_name: '  Grace Hopper' }]),
    ];
    expect(deriveSpeakerNames(blocks)).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  it('skips null hosts, blank names, and malformed topics jsonb', () => {
    const blocks = [
      blk(null, [{ title: 'T', speaker_name: '   ' }]),
      blk('  ', 'not-an-array'),
      blk(null, [{ title: 'no speaker field' }, null]),
    ];
    expect(deriveSpeakerNames(blocks)).toEqual([]);
  });

  it('includes hosts of break/transition blocks (no kind filter)', () => {
    // G3 derivation per the redesign plan: "host + topic speakers, dedupe" —
    // no kind filter. A break hosted by a person still puts them on stage.
    const blocks: SpeakerSourceBlock[] = [
      { kind: 'break', host: 'MC Coffee', topics: [] },
      { kind: 'transition', host: 'Stage Manager', topics: [] },
    ];
    expect(deriveSpeakerNames(blocks)).toEqual(['MC Coffee', 'Stage Manager']);
  });
});
