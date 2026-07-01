import { describe, expect, it } from 'vitest';
import { renderReminderEmail } from './reminder';

describe('renderReminderEmail', () => {
  const sampleProps = {
    firstName: 'Alice',
    eventTitle: 'Q3 Engineering All-Hands',
    eventStart: '12 Sep 2026, 10:00',
    eventVenue: 'Conference Room A, 12/F HQ',
    venueMapUrl: 'https://maps.google.com/?q=12%2FF%20HQ',
    checkinCode: 'WK-2345XY',
    qrCid: 'checkin-qr',
    editionLabel: 'CC-Asia 2026',
    countdownLabel: 'Starts in 60 minutes',
  };

  it('contains the event details and the manual check-in code', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toContain('Q3 Engineering All-Hands');
    expect(html).toContain('12 Sep 2026, 10:00');
    expect(html).toContain('Conference Room A, 12/F HQ');
    expect(html).toContain('WK-2345XY');
  });

  it('references the QR as an inline cid: image', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toContain('cid:checkin-qr');
  });

  it('renders the 2px green QR bezel', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toContain('#4ADE80'); // green bezel per Email #2 v6 spec
  });

  it('labels the manual code and explains the fallback', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toContain('Manual check-in code');
    expect(html).toMatch(/If the QR won.{0,6}t scan/); // apostrophe entity-safe
  });

  it('greets with the first name and shows the countdown', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toMatch(/See you soon, (?:<!-- -->)?Alice(?:<!-- -->)?\./);
    expect(html).toContain('Starts in 60 minutes');
    expect(html).toContain('CC-Asia 2026');
  });

  it('links the venue to the map when a map URL is provided', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toMatch(/<a[^>]+href="https:\/\/maps\.google\.com\/\?q=12%2FF%20HQ"/);
  });

  it('renders venue as plain text when no map URL is provided', async () => {
    const html = await renderReminderEmail({ ...sampleProps, venueMapUrl: undefined });
    expect(html).toContain('Conference Room A, 12/F HQ');
    expect(html).not.toContain('maps.google.com');
  });

  it('contains no literal "undefined" or "null"', async () => {
    const html = await renderReminderEmail({ ...sampleProps, editionLabel: undefined });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders to table-based HTML (no flex/grid)', async () => {
    const html = await renderReminderEmail(sampleProps);
    expect(html).toContain('<table');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
  });
});
