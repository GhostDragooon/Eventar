import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// Mock the Resend SDK at the module level. Per-test we configure mockSend.
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function (this: { emails: { send: typeof mockSend } }) {
    this.emails = { send: mockSend };
  }),
}));

import { sendEmail } from './resend';

describe('lib/resend.sendEmail', () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.RESEND_API_KEY = 'test_key_re_xxxxxxxx';
    process.env.RESEND_FROM_EMAIL = 'Eventar Test <test@example.com>';
  });

  it('throws clear error when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);
  });

  it('returns { ok, id } when Resend SDK succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_123abc' }, error: null });
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
    });
    expect(result).toEqual({ ok: true, id: 're_123abc' });
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Eventar Test <test@example.com>',
      to: 'a@b.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
    });
  });

  it('returns { error: { code, message } } when Resend returns an API error', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid recipient', statusCode: 422 },
    });
    const result = await sendEmail({
      to: 'invalid',
      subject: 'x',
      html: '<p>x</p>',
    });
    // statusCode is carried through so callers can distinguish a 409
    // idempotency conflict (already submitted) from an ordinary failure.
    expect(result).toEqual({
      error: { code: 'validation_error', message: 'Invalid recipient', statusCode: 422 },
    });
  });

  // A network error is caught and returned as { error }, INDISTINGUISHABLE from
  // a provider rejection — so a send Resend actually accepted can be recorded
  // as failed and retried. Since 20260805000000 made failed rows retryable,
  // that race would deliver a second QR pass to a regulated professional. The
  // idempotency key closes it provider-side: same key, one delivery.
  it('passes the caller idempotency key to Resend as a second-argument option', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_idem' }, error: null });

    await sendEmail({
      to: 'a@x.com',
      subject: 's',
      html: '<p>h</p>',
      idempotencyKey: 'evt-1:reminder:reg-9',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@x.com' }),
      { idempotencyKey: 'evt-1:reminder:reg-9' },
    );
  });

  it('omits the options argument entirely when no idempotency key is given', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_plain' }, error: null });

    await sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>' });

    expect(mockSend.mock.calls[0]).toHaveLength(1);
  });

  it('returns { error } when the SDK throws (network failure)', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }));
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' });
    expect(result).toEqual({
      error: { code: 'ECONNRESET', message: 'ECONNRESET' },
    });
  });

  it('forwards inline CID attachments to the Resend SDK', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_att' }, error: null });
    await sendEmail({
      to: 'a@b.com',
      subject: 'Reminder',
      html: '<img src="cid:checkin-qr" />',
      attachments: [
        { filename: 'checkin-qr.png', content: 'YmFzZTY0', contentId: 'checkin-qr' },
      ],
    });
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Eventar Test <test@example.com>',
      to: 'a@b.com',
      subject: 'Reminder',
      html: '<img src="cid:checkin-qr" />',
      attachments: [
        { filename: 'checkin-qr.png', content: 'YmFzZTY0', contentId: 'checkin-qr' },
      ],
    });
  });

  it('omits the attachments key entirely when none are provided', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_noatt' }, error: null });
    await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' });
    const callArg = mockSend.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('attachments');
  });
});
