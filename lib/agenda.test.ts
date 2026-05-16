import { describe, expect, it } from 'vitest';
import { findParallelBlockIds, type BlockTime } from './agenda';

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
