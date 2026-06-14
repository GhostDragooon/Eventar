import { describe, expect, it } from 'vitest';
import { labelForBlock, speakerForBlock } from './labelForBlock';

describe('speakerForBlock', () => {
  it('prefers host over topics[0].speaker_name', () => {
    expect(
      speakerForBlock({
        host: 'Dr. Host',
        topics: [{ speaker_name: 'Dr. Topic' }],
      }),
    ).toBe('Dr. Host');
  });

  it('falls back to first topic speaker when host is null', () => {
    expect(
      speakerForBlock({
        host: null,
        topics: [{ speaker_name: 'Dr. Topic' }],
      }),
    ).toBe('Dr. Topic');
  });

  it('falls back to first topic speaker when host is an empty/whitespace string', () => {
    expect(
      speakerForBlock({
        host: '   ',
        topics: [{ speaker_name: 'Dr. Topic' }],
      }),
    ).toBe('Dr. Topic');
  });

  it('returns null when neither host nor any topic speaker is set', () => {
    expect(speakerForBlock({ host: null, topics: [] })).toBeNull();
    expect(speakerForBlock({ host: '', topics: [{ speaker_name: '' }] })).toBeNull();
  });

  it('tolerates topics being a non-array (jsonb is untyped)', () => {
    expect(speakerForBlock({ host: 'Dr. Host', topics: null })).toBe('Dr. Host');
    expect(speakerForBlock({ host: null, topics: 'broken' })).toBeNull();
  });

  it('skips topic entries that are not objects, then takes the first usable speaker', () => {
    expect(
      speakerForBlock({
        host: null,
        topics: [null, 'invalid', { speaker_name: '   Dr. Real   ' }],
      }),
    ).toBe('Dr. Real');
  });
});

describe('labelForBlock', () => {
  it('joins title and speaker with " · "', () => {
    expect(
      labelForBlock({
        title: 'Welcome',
        host: 'Dr. Host',
        topics: [],
      }),
    ).toBe('Welcome · Dr. Host');
  });

  it('uses an em-dash placeholder when there is no speaker', () => {
    expect(
      labelForBlock({
        title: 'Coffee break',
        host: null,
        topics: [],
      }),
    ).toBe('Coffee break · —');
  });

  it('uses the title as-is even if it is empty (caller is responsible for non-empty titles)', () => {
    expect(labelForBlock({ title: '', host: null, topics: [] })).toBe(' · —');
  });
});
