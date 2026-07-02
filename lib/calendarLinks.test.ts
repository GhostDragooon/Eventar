import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, outlookCalendarUrl, buildIcs } from './calendarLinks';

const input = {
  title: 'Q3 All-Hands; Live, Demo',
  startIso: '2026-09-12T02:00:00.000Z',
  endIso: '2026-09-12T05:30:00.000Z',
  venue: 'Demo Hall, Central',
  detailsUrl: 'https://eventar.example.com/events/abc',
  uid: 'abc',
};

describe('googleCalendarUrl', () => {
  it('encodes UTC basic-format dates and the title', () => {
    const url = googleCalendarUrl(input);
    expect(url).toContain('calendar.google.com/calendar/render');
    expect(url).toContain('dates=20260912T020000Z%2F20260912T053000Z');
    expect(url).toContain(encodeURIComponent('Q3 All-Hands; Live, Demo').replace(/%20/g, '+'));
  });
});

describe('outlookCalendarUrl', () => {
  it('carries subject + ISO start/end', () => {
    const url = outlookCalendarUrl(input);
    expect(url).toContain('outlook.live.com/calendar/0/deeplink/compose');
    expect(url).toContain('startdt=2026-09-12T02%3A00%3A00.000Z');
    expect(url).toContain('enddt=2026-09-12T05%3A30%3A00.000Z');
  });
});

describe('buildIcs', () => {
  it('produces a valid single-VEVENT calendar with escaped text', () => {
    const ics = buildIcs(input);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260912T020000Z');
    expect(ics).toContain('DTEND:20260912T053000Z');
    // RFC 5545 escaping: ; and , in the title must be backslash-escaped.
    expect(ics).toContain('SUMMARY:Q3 All-Hands\\; Live\\, Demo');
    expect(ics).toContain('UID:abc@eventar');
    expect(ics).toContain('END:VCALENDAR');
    // CRLF line endings per RFC.
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });
});
