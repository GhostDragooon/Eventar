import { describe, expect, it } from 'vitest';
import { renderConfirmationEmail } from './confirmation';

describe('renderConfirmationEmail', () => {
  const sampleProps = {
    recipientName: 'Alice Liddell',
    eventTitle: 'Q3 Engineering All-Hands',
    eventStart: 'Wed, 12 Sep 2026 · 10:00 AM HKT',
    eventVenue: 'Conference Room A, 12/F HQ',
    eventUrl: 'https://eventar.example.com/events/abc-123',
    registrationCode: 'WK-2345XY',
  };

  it('rendered HTML contains the registration code, event title, and event URL', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('WK-2345XY');
    expect(html).toContain('Q3 Engineering All-Hands');
    expect(html).toContain('https://eventar.example.com/events/abc-123');
  });

  it('rendered HTML contains greeting with recipient name + venue', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('Alice Liddell');
    expect(html).toContain('Conference Room A, 12/F HQ');
  });

  it('rendered HTML does not contain literal "undefined" or "null"', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});
