import { describe, expect, it } from 'vitest';
import { renderConfirmationEmail } from './confirmation';

describe('renderConfirmationEmail', () => {
  const sampleProps = {
    firstName: 'Alice',
    eventTitle: 'Q3 Engineering All-Hands',
    eventStart: 'Wed, 12 Sep 2026 · 10:00 AM HKT',
    eventVenue: 'Conference Room A, 12/F HQ',
    eventUrl: 'https://eventar.example.com/events/abc-123',
    googleCalUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=x',
    outlookCalUrl: 'https://outlook.live.com/calendar/0/deeplink/compose?subject=x',
    icsUrl: 'https://eventar.example.com/events/abc-123/calendar.ics',
  };

  it('contains the green REGISTERED eyebrow, event title, and event URL', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toMatch(/Registered ·/);
    expect(html).toContain('Q3 Engineering All-Hands');
    expect(html).toContain('https://eventar.example.com/events/abc-123');
  });

  it('greets with "You\'re in, {name}." + venue', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toMatch(/You(?:&#x27;|&apos;|')re in, (?:<!-- -->)?Alice(?:<!-- -->)?\./);
    expect(html).toContain('Conference Room A, 12/F HQ');
  });

  it('drops the name cleanly when firstName is empty', async () => {
    const html = await renderConfirmationEmail({ ...sampleProps, firstName: '' });
    expect(html).toMatch(/You(?:&#x27;|&apos;|')re in\./);
    expect(html).not.toMatch(/You(?:&#x27;|&apos;|')re in,\s*\./);
  });

  it('renders the three add-to-calendar links', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain(sampleProps.googleCalUrl.replace(/&/g, '&amp;'));
    expect(html).toContain(sampleProps.outlookCalUrl);
    expect(html).toContain(sampleProps.icsUrl);
    expect(html).toContain('Add to calendar');
  });

  it('carries NO QR and NO registration code (locked: the pass ships in Email #2)', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).not.toMatch(/WK-[A-Z0-9]/);
    expect(html).not.toMatch(/registration code/i);
    expect(html).not.toContain('cid:');
    // What's-next sets the expectation instead.
    expect(html).toMatch(/What(?:&#x27;|&apos;|')s next/);
    expect(html).toContain('60 minutes before');
  });

  it('does not contain literal "undefined" or "null"', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders to table-based HTML (no flex/grid in output)', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('<table');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
    expect(html).not.toMatch(/[^-]gap\s*:/i);
  });

  it('renders the CTA as a table-wrapped bulletproof button', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toMatch(/<td[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?View event details/);
  });
});
