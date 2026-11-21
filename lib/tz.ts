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

// The instant as the venue's wall clock with its UTC offset ("2026-12-04T09:00:00+08:00"): machine-parseable like
// the raw ISO, and honest about whose clock it is. The CSV export used to print the UTC string next to the venue's
// zone name, which read as local time.
export function isoInTz(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone,
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((wallAsUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
  const a = Math.abs(offMin);
  const off = `${offMin < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

// Which zone a time is shown in for the person exporting it: their browser's zone, else the zone of the IP they
// connected from (Vercel sends it as x-vercel-ip-timezone; nothing is looked up, so no external service), else the
// event's own venue zone. A value that is not a real IANA zone is skipped, never thrown on.
export function resolveViewerTz(candidates: Array<string | null | undefined>, eventTz: string): string {
  for (const tz of candidates) {
    if (!tz) continue;
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: tz });
      return tz;
    } catch {
      // not a zone: try the next one
    }
  }
  return eventTz;
}

export function browserTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
