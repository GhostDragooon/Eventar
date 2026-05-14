export function formatInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).formatToParts(new Date(iso));

  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.day} ${m.month} ${m.year}, ${m.hour}:${m.minute}`;
}

export function browserTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
