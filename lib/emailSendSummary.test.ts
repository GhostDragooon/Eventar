import { describe, expect, it } from 'vitest';
import { formatSendResult, composeSendMessage } from './emailSendSummary';

describe('formatSendResult', () => {
  it('returns the batch error verbatim when present', () => {
    expect(formatSendResult({ sent: 0, queued: 0, skipped: 0, failed: 0, error: 'You are not authorized for this event.' }))
      .toBe('You are not authorized for this event.');
  });

  it('summarises a real send', () => {
    expect(formatSendResult({ sent: 3, queued: 0, skipped: 0, failed: 0 })).toBe('3 sent');
  });

  it('names the dev-stub batch as logged-not-emailed, never "queued"', () => {
    const msg = formatSendResult({ sent: 0, queued: 2, skipped: 0, failed: 0 });
    expect(msg).toContain('not emailed');
    expect(msg).not.toContain('queued');
  });

  it('describes an idempotent skip as already-sent, never a bare "skipped"', () => {
    expect(formatSendResult({ sent: 0, queued: 0, skipped: 2, failed: 0 })).toBe('2 already sent');
  });

  it('joins mixed outcomes with a separator', () => {
    expect(formatSendResult({ sent: 1, queued: 0, skipped: 2, failed: 1 })).toBe('1 sent · 2 already sent · 1 failed');
  });

  it('reports no eligible recipients when everything is zero', () => {
    expect(formatSendResult({ sent: 0, queued: 0, skipped: 0, failed: 0 })).toBe('No eligible recipients.');
  });
});

describe('composeSendMessage', () => {
  it('surfaces a batch error verbatim (no label prefix)', () => {
    expect(composeSendMessage('reminder', { sent: 0, queued: 0, skipped: 0, failed: 0, error: 'Event not found.' }))
      .toBe('Event not found.');
  });

  it('gives a reminder-specific empty message when there are no recipients', () => {
    const msg = composeSendMessage('reminder', { sent: 0, queued: 0, skipped: 0, failed: 0 });
    expect(msg).toMatch(/registered/i);
  });

  it('gives a survey-specific empty message when no one has attended', () => {
    const msg = composeSendMessage('survey', { sent: 0, queued: 0, skipped: 0, failed: 0 });
    expect(msg).toMatch(/attend/i);
  });

  it('labels a non-empty reminder result', () => {
    expect(composeSendMessage('reminder', { sent: 2, queued: 0, skipped: 0, failed: 0 })).toBe('Reminders: 2 sent');
  });

  it('labels a non-empty survey result', () => {
    expect(composeSendMessage('survey', { sent: 0, queued: 1, skipped: 0, failed: 0 })).toContain('Survey invites:');
  });
});
