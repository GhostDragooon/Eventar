import { describe, expect, it, vi } from 'vitest';
// devEmailStub uses `import 'server-only'`, same neutralisation as auth.test.ts.
vi.mock('server-only', () => ({}));

import { sendEmail } from './devEmailStub';

describe('devEmailStub.sendEmail', () => {
  it('returns { skipped: true } without performing a real send', async () => {
    // eslint-disable-next-line no-console
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'alice@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });

    expect(result).toEqual({ skipped: true });

    // CLAUDE.md Rule 10: no PII in logs. The recipient email must NOT appear
    // in the console output. The stub logs that something would be sent but
    // doesn't reveal the recipient.
    const allLogs = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).not.toContain('alice@example.com');

    logSpy.mockRestore();
  });
});
