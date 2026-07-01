import { describe, expect, it } from 'vitest';
import { formatSendResult } from './emailSendSummary';

describe('formatSendResult', () => {
  it('returns the batch error verbatim when present', () => {
    expect(formatSendResult({ sent: 0, queued: 0, skipped: 0, failed: 0, error: 'You are not authorized for this event.' }))
      .toBe('You are not authorized for this event.');
  });

  it('summarises a real send', () => {
    expect(formatSendResult({ sent: 3, queued: 0, skipped: 0, failed: 0 })).toBe('3 sent');
  });

  it('summarises a dev-stub batch as queued', () => {
    expect(formatSendResult({ sent: 0, queued: 2, skipped: 0, failed: 0 })).toBe('2 queued');
  });

  it('joins mixed outcomes with a separator', () => {
    expect(formatSendResult({ sent: 1, queued: 0, skipped: 2, failed: 1 })).toBe('1 sent · 2 skipped · 1 failed');
  });

  it('reports no eligible recipients when everything is zero', () => {
    expect(formatSendResult({ sent: 0, queued: 0, skipped: 0, failed: 0 })).toBe('No eligible recipients.');
  });
});
