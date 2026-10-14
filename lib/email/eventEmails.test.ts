import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

// The two senders the switch chooses between. Everything else eventEmails.ts
// imports is inert at load time and is never reached by these tests.
const { mockSendReal, mockSendStub } = vi.hoisted(() => ({
  mockSendReal: vi.fn(),
  mockSendStub: vi.fn(),
}));
vi.mock('@/lib/resend', () => ({ sendEmail: mockSendReal }));
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));

import { emailLive, sendEmail } from './eventEmails';

const opts = { to: 'alice@example.com', subject: 'Hi', html: '<p>hi</p>', idempotencyKey: 'k-1' };

beforeEach(() => {
  mockSendReal.mockReset().mockResolvedValue({ ok: true, id: 're_1' });
  mockSendStub.mockReset().mockResolvedValue({ skipped: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the stub-vs-real email switch', () => {
  it('sends for real when the key is set, production included', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');

    expect(emailLive()).toBe(true);
    expect(await sendEmail(opts)).toEqual({ ok: true, id: 're_1' });
    expect(mockSendReal).toHaveBeenCalledWith(opts);
    expect(mockSendStub).not.toHaveBeenCalled();
  });

  it('stubs outside production when the key is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', '');

    expect(emailLive()).toBe(false);
    expect(await sendEmail(opts)).toEqual({ skipped: true });
    expect(mockSendStub).toHaveBeenCalledTimes(1);
    expect(mockSendReal).not.toHaveBeenCalled();
  });

  // THE guard. A stub in production parks every row in terminal `queued` and
  // reads as fine; an error makes callers mark it `failed` (retryable) and say so.
  it('returns a send error in production when the key is unset — never stubs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(emailLive()).toBe(false);
    const result = await sendEmail(opts);

    expect(result).toEqual({
      error: { code: 'resend_not_configured', message: 'RESEND_API_KEY is unset in production' },
    });
    expect(mockSendStub).not.toHaveBeenCalled();
    expect(mockSendReal).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // Rule 10: the misconfig log names no recipient.
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('alice@example.com');
  });
});
