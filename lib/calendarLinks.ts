// Calendar-import helpers for Email #1 (Design Session Log §"Email #1 design
// patterns" + Backend TODOs): Google / Outlook URL builders + .ics generation.
// All times are encoded as UTC instants — calendar clients localise them, so
// the entry lands at the correct wall-clock time in every timezone.

export type CalendarEventInput = {
  title: string;
  startIso: string; // UTC ISO from events.start_time
  endIso: string;
  venue: string;
  detailsUrl: string; // public event page
  uid: string; // stable id for the ICS (event id)
};

// 20260701T094500Z — the "basic" UTC stamp both Google and ICS want.
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function googleCalendarUrl(e: CalendarEventInput): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.startIso)}/${utcStamp(e.endIso)}`,
    location: e.venue,
    details: `Event details: ${e.detailsUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function outlookCalendarUrl(e: CalendarEventInput): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: new Date(e.startIso).toISOString(),
    enddt: new Date(e.endIso).toISOString(),
    location: e.venue,
    body: `Event details: ${e.detailsUrl}`,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}

// RFC 5545 text values need commas/semicolons/backslashes/newlines escaped.
function icsEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Minimal single-event VCALENDAR — served as the "Apple Calendar" link. */
export function buildIcs(e: CalendarEventInput): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventar//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(e.uid)}@eventar`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(e.startIso)}`,
    `DTEND:${utcStamp(e.endIso)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape(e.venue)}`,
    `DESCRIPTION:${icsEscape(`Event details: ${e.detailsUrl}`)}`,
    `URL:${e.detailsUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
