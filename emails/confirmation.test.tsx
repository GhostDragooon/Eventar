import { describe, expect, it } from 'vitest';
import { renderConfirmationEmail } from './confirmation';

describe('renderConfirmationEmail', () => {
  const sampleProps = {
    firstName: 'Alice',
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

  it('rendered HTML contains greeting with first name + venue', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    // The greeting line uses first-name only ("You're registered, Alice.").
    // React Email inserts <!-- --> comments between static text and JSX
    // interpolations, so the rendered HTML reads
    // "You&#x27;re registered, <!-- -->Alice<!-- -->.".
    expect(html).toMatch(/You(?:&#x27;|&apos;|')re registered, (?:<!-- -->)?Alice(?:<!-- -->)?\./);
    expect(html).toContain('Conference Room A, 12/F HQ');
  });

  it('rendered HTML does not contain literal "undefined" or "null"', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders to table-based HTML (no flex/grid in output)', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('<table');
    // React Email pads with table cells; verify no CSS that fails in email clients
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
    expect(html).not.toMatch(/[^-]gap\s*:/i); // avoid flex/grid gap (border-radius/box-shadow OK)
  });

  it('renders the locked RC-B sunny-amber code block', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('#FFFBEB'); // amber-50 bg
    expect(html).toContain('#7C2D12'); // orange-900 code value
    expect(html).toContain('#92400E'); // orange-700 label
  });

  it('renders the CTA as a table-wrapped bulletproof button', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    // React Email <Button> wraps in <table>...<td>...<a>
    // Verify the button text appears inside a <td> not a bare <a> as the first ancestor
    expect(html).toMatch(/<td[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?View event details/);
  });
});
