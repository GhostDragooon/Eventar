import tzlookup from 'tz-lookup';

export function tzFromCoords(latitude: number, longitude: number): string {
  return tzlookup(latitude, longitude);
}

export function formatInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).formatToParts(new Date(iso));

  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.day} ${m.month} ${m.year}, ${m.hour}:${m.minute}`;
}

// The organiser's zone arrives in the eventar-tz cookie, which the browser
// writes (DashboardWorkstation) and the client fully controls: accept only a
// zone Intl recognises. Missing or invalid falls back to UTC until the
// browser sets it.
export function organiserTz(cookieValue: string | undefined): string {
  if (!cookieValue) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en', { timeZone: cookieValue }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function browserTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
