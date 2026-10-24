import { describe, expect, it } from 'vitest';
import { blockInputSchema } from './schema';

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
