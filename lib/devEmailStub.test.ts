import { describe, expect, it, vi } from 'vitest';
// devEmailStub uses `import 'server-only'`, same neutralisation as auth.test.ts.
vi.mock('server-only', () => ({}));

import { sendEmail } from './devEmailStub';

describe('devEmailStub.sendEmail', () => {
  it('returns { skipped: true } and does not log recipient PII on any channel', async () => {
    // Rule 10: no PII in logs. Spy on every console channel — log AND error AND
    // warn AND info — so a future "improvement" that switches channels doesn't
    // silently leak. (process.stdout.write would also catch direct stream
    // writes; not adding it now because the project's convention is console.*.)
    // eslint-disable-next-line no-console
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // eslint-disable-next-line no-console
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line no-console
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line no-console
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'alice@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });

    expect(result).toEqual({ skipped: true });

    const allLogs = [logSpy, errorSpy, warnSpy, infoSpy]
      .flatMap(spy => spy.mock.calls.map(c => c.join(' ')))
      .join('\n');
    expect(allLogs).not.toContain('alice@example.com');

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
