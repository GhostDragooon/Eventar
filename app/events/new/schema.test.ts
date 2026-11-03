import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blockInputSchema, blockZodErrors } from './schema';

const block = {
  start_time: '2026-06-15T09:00:00.000Z',
  end_time: '2026-06-15T10:00:00.000Z',
  kind: 'workshop' as const,
  title: 'Intro',
};

describe('blockInputSchema id', () => {
  it('keeps the id of a block that already exists', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(blockInputSchema.parse({ ...block, id }).id).toBe(id);
  });

  it('leaves a new block without an id', () => {
    expect(blockInputSchema.parse(block).id).toBeUndefined();
  });

  it('rejects an id that is not a uuid', () => {
    expect(blockInputSchema.safeParse({ ...block, id: 'b1' }).success).toBe(false);
  });
});

describe('blockZodErrors', () => {
  const issuesOf = (blocks: unknown[]) => {
    const r = z.array(blockInputSchema).safeParse(blocks);
    return r.success ? [] : r.error.issues;
  };

  it('names the block by its title, never by its position in the sorted list', () => {
    const blocks = [block, { ...block, title: 'Late talk', end_time: '2026-06-15T08:00:00.000Z' }];
    const msg = blockZodErrors(issuesOf(blocks), blocks);
    expect(msg).toBe('Agenda block "Late talk" (end_time): Block end must be after start');
    expect(msg).not.toMatch(/block 1/i);
  });

  it('says a block needs a title in a sentence when it has none to name', () => {
    const blocks = [{ ...block, title: '  ' }];
    expect(blockZodErrors(issuesOf(blocks), blocks)).toBe('An agenda block (title): Every agenda block needs a title.');
  });

  it('says a topic needs a speaker, not a zod default', () => {
    const blocks = [{ ...block, topics: [{ title: 'T', speaker_name: '' }] }];
    expect(blockZodErrors(issuesOf(blocks), blocks)).toBe('Agenda block "Intro" (topics.0.speaker_name): Every topic needs a speaker name.');
  });
});
