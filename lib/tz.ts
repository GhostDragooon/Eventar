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

// formatInTz plus the zone, so a reader can tell whose clock it is: "14 Dec 2026, 09:00 (GMT+8)". The label is
// per instant (New York is GMT-5 in winter, GMT-4 in summer), en-GB short, the same form the public list prints.
export function formatInTzWithZone(iso: string, timeZone: string): string {
  const zone = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short', timeZone })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'timeZoneName')?.value;
  return `${formatInTz(iso, timeZone)} (${zone})`;
}

export function browserTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
