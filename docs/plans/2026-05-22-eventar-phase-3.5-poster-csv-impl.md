# Phase 3.5 — Poster Page + CSV Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Add a public `/events/{id}/poster` route with inline QR + print CSS; add the QR to the existing `/events/{id}` page; add a staff CSV export of registrants gated on "registration closed".

**Architecture:** Extract QR generation into `lib/qr.ts` so both staff (`getEventQrPng`) and public surfaces (the two pages) can call it. Add a second Server Action `exportRegistrantsCsv()` mirroring the Phase 3 pattern (base64-encoded payload, client builds a `data:` URL and triggers download).

**Tech Stack:** Next.js 16 App Router, TypeScript, existing `qrcode` package, existing `supabaseServer()` + `supabaseAdmin()` helpers, existing `requireStaff()` gate, vitest for unit tests.

**Design doc:** [`docs/plans/2026-05-22-eventar-phase-3.5-poster-csv-design.md`](./2026-05-22-eventar-phase-3.5-poster-csv-design.md). Read before starting if you don't have the design in working memory.

---

## Pre-flight

- Working directory: `/Users/ivan/Eventar`
- Branch: `main` (single-branch policy per CLAUDE.md rule 6)
- Confirm tree is clean: `git status` → "nothing to commit, working tree clean"
- Confirm gates pass at start: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run`
- User's `pnpm dev` is already running on port 3000 — do NOT start another dev server (port conflict + user direction)
- Expected starting vitest count: **65/65 pass** (59 Phase 1/2 + 6 slugify)

---

## Task 1: Extract `lib/qr.ts` (refactor only, no behaviour change)

**Files:**
- Create: `lib/qr.ts`
- Modify: `app/events/[id]/edit/actions.ts`

**Why first:** The poster page and the public-page QR addition both need this helper. Refactor first, then build on it.

**Step 1: Create `lib/qr.ts`**

```ts
import QRCode from 'qrcode';
import { slugifyTitle } from '@/lib/slugify';

/**
 * Build a 512x512 PNG QR code for an event's public URL.
 *
 * Pure-ish glue: takes an event {id, title} and the request origin, returns
 * base64 bytes + a filename. No auth, no DB — auth lives in the caller.
 *
 * Used by:
 *   - app/events/[id]/edit/actions.ts::getEventQrPng (staff, downloadable)
 *   - app/(public)/events/[id]/page.tsx              (public, inline render)
 *   - app/(public)/events/[id]/poster/page.tsx       (public, inline render)
 */
export async function buildEventQrPng(
  event: { id: string; title: string },
  origin: string,
): Promise<{ pngBase64: string; filename: string }> {
  const publicUrl = `${origin}/events/${event.id}`;

  // errorCorrectionLevel 'M' (~15% tolerance), margin 2 (maximises QR area).
  // Same options as the original getEventQrPng — no behaviour change.
  const buf = await QRCode.toBuffer(publicUrl, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });

  const slug = slugifyTitle(event.title);
  return {
    pngBase64: buf.toString('base64'),
    filename: `event-${slug || event.id}.png`,
  };
}
```

**Step 2: Refactor `getEventQrPng` to delegate**

Open `app/events/[id]/edit/actions.ts`. Replace the QR-generation portion with a call to `buildEventQrPng`. Final shape of `getEventQrPng`:

```ts
export async function getEventQrPng(
  eventId: string,
): Promise<{ pngBase64: string; filename: string } | { error: string }> {
  await requireStaff();
  const supabase = await supabaseServer();

  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, status')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (!event) return { error: 'Event not found.' };
  if (event.status !== 'published') return { error: 'QR is available after publishing.' };

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  return buildEventQrPng({ id: event.id, title: event.title }, origin);
}
```

Remove the now-unused `QRCode` import and `slugifyTitle` import from this file (they live in `lib/qr.ts` now).

**Step 3: Verify static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint app/events/\[id\]/edit/actions.ts lib/qr.ts
```

Expected: clean.

**Step 4: Verify behaviour unchanged**

```bash
pnpm exec vitest run
```

Expected: 65/65 pass (no test added — refactor only).

**Step 5: Commit**

```bash
git add lib/qr.ts app/events/\[id\]/edit/actions.ts
git commit -m "refactor(phase-3.5): extract buildEventQrPng to lib/qr.ts for reuse"
```

---

## Task 2: `lib/csv.ts` (TDD)

**Files:**
- Create: `lib/csv.ts`
- Create: `lib/csv.test.ts`

**Step 1: Write failing tests**

```ts
// lib/csv.test.ts
import { describe, expect, it } from 'vitest';
import { csvEscape, buildCsv } from './csv';

describe('csvEscape', () => {
  it('returns plain field unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('quotes fields containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles internal double quotes', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('quotes fields with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes fields with all three special chars', () => {
    expect(csvEscape('a, "b"\nc')).toBe('"a, ""b""\nc"');
  });

  it('escapes empty string as empty (no quotes)', () => {
    expect(csvEscape('')).toBe('');
  });
});

describe('buildCsv', () => {
  it('joins rows with CRLF and fields with commas', () => {
    expect(buildCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });

  it('escapes each field via csvEscape', () => {
    expect(buildCsv([['hello, world', 'plain']])).toBe('"hello, world",plain\r\n');
  });

  it('handles zero rows (empty string)', () => {
    expect(buildCsv([])).toBe('');
  });

  it('handles a single header row + zero data rows', () => {
    expect(buildCsv([['name', 'email']])).toBe('name,email\r\n');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run lib/csv.test.ts
```

Expected: FAIL — "Cannot find module './csv'".

**Step 3: Implement `lib/csv.ts`**

```ts
/**
 * Escape a single CSV field per RFC 4180.
 * Wrap in double quotes if the field contains a comma, double quote, or newline.
 * Internal double quotes are doubled.
 */
export function csvEscape(field: string): string {
  if (field === '') return '';
  if (/[",\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Build a CSV string from a 2D string array. Each row gets a CRLF terminator
 * (RFC 4180). Empty input returns an empty string.
 */
export function buildCsv(rows: string[][]): string {
  if (rows.length === 0) return '';
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run lib/csv.test.ts
```

Expected: PASS, 10/10.

**Step 5: Confirm full suite green**

```bash
pnpm exec vitest run
```

Expected: **75/75** (65 prior + 10 new).

**Step 6: Commit**

```bash
git add lib/csv.ts lib/csv.test.ts
git commit -m "feat(phase-3.5): csvEscape + buildCsv pure helpers (TDD)"
```

---

## Task 3: Public poster page (`/events/{id}/poster`)

**Files:**
- Create: `app/(public)/events/[id]/poster/page.tsx`

**Step 1: Implement the route**

```tsx
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { buildEventQrPng } from '@/lib/qr';
import type { AgendaTopic } from '@/lib/agenda';
import RegisterCard from '@/components/RegisterCard';

export const dynamic = 'force-dynamic';

export default async function EventPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees',
    )
    .eq('id', id)
    .maybeSingle();

  // RLS filters to status='published' for anon; this 404s drafts + non-existent.
  if (!event || event.status !== 'published') notFound();

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, start_time, end_time')
    .eq('event_id', id)
    .order('start_time', { ascending: true });

  const { count: registrationCount } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const { pngBase64 } = await buildEventQrPng(
    { id: event.id, title: event.title },
    origin,
  );

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8 print:p-0 print:max-w-none">
      <header className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {event.topic ?? 'Event'}
        </p>
        <h1 className="text-5xl font-semibold mt-2 print:text-4xl">{event.title}</h1>
        <p className="text-gray-700 mt-3 text-lg">
          {formatInTz(event.start_time, event.timezone)} →{' '}
          {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <p className="text-gray-700 mt-1">
          📍 {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''} — {event.city}
          {event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </header>

      <section className="flex flex-col items-center">
        <img
          src={`data:image/png;base64,${pngBase64}`}
          alt="QR code — scan to open this event"
          className="w-64 h-64 print:w-80 print:h-80"
        />
        <p className="text-sm text-gray-600 mt-2">Scan to register</p>
      </section>

      {event.description && (
        <section>
          <h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-2">Agenda</h2>
          <ul className="divide-y border rounded-xl">
            {blocks!.map(b => {
              const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
              return (
                <li key={b.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-gray-500">{b.kind}</span>
                    <span className="text-sm text-gray-700">
                      {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                    </span>
                  </div>
                  <p className="font-medium mt-1">{b.title}</p>
                  {b.host && <p className="text-sm text-gray-600">Chair: {b.host}</p>}
                  {topics.length > 0 && (
                    <ul className="mt-2 text-sm space-y-1">
                      {topics.map((t, i) => (
                        <li key={i}>
                          • {t.title} — <em>{t.speaker_name}</em>
                          {t.speaker_credential && <span className="text-gray-500"> ({t.speaker_credential})</span>}
                          {t.speaker_affiliation && <span className="text-gray-500">, {t.speaker_affiliation}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="print:hidden">
        <RegisterCard
          eventId={event.id}
          maxAttendees={event.max_attendees}
          currentCount={registrationCount ?? 0}
        />
      </div>

      <div className="flex justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Print poster
        </button>
      </div>
    </main>
  );
}
```

**Step 1a — wait, server component can't use `onClick`.** Extract the Print button to a tiny client component.

Create `components/PrintPosterButton.tsx`:

```tsx
'use client';

export default function PrintPosterButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      Print poster
    </button>
  );
}
```

And in `poster/page.tsx`, import + use it:

```tsx
import PrintPosterButton from '@/components/PrintPosterButton';
// ...
<div className="flex justify-center print:hidden">
  <PrintPosterButton />
</div>
```

**Step 2: Run static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint app/\(public\)/events/\[id\]/poster/page.tsx components/PrintPosterButton.tsx
```

Expected: clean.

**Step 3: Confirm `next build` picks up the new route**

```bash
pnpm exec next build 2>&1 | tail -20
```

Expected: 9 routes total (was 8). `/events/[id]/poster` should appear.

**Step 4: Commit**

```bash
git add app/\(public\)/events/\[id\]/poster/page.tsx components/PrintPosterButton.tsx
git commit -m "feat(phase-3.5): public /events/[id]/poster route with inline QR + print CSS"
```

---

## Task 4: Add QR to the existing `/events/{id}` public page

**Files:**
- Modify: `app/(public)/events/[id]/page.tsx`

**Step 1: Add the QR section**

Add the necessary imports at the top:

```tsx
import { headers } from 'next/headers';
import { buildEventQrPng } from '@/lib/qr';
```

Inside `PublicEventPage`, after the existing event SELECT and before `RegisterCard`, add the QR generation + render:

```tsx
const h = await headers();
const proto = h.get('x-forwarded-proto') ?? 'http';
const host = h.get('host') ?? 'localhost:3000';
const { pngBase64 } = await buildEventQrPng(
  { id: event.id, title: event.title },
  `${proto}://${host}`,
);
```

And in the JSX, place a small QR section above the `<RegisterCard ...>` element:

```tsx
<section className="flex items-center gap-4">
  <img
    src={`data:image/png;base64,${pngBase64}`}
    alt="QR code for this event"
    className="w-32 h-32"
  />
  <p className="text-sm text-gray-600">
    Scan or share this code to open this event on another device.
  </p>
</section>
```

**Step 2: Run static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint app/\(public\)/events/\[id\]/page.tsx
```

Expected: clean.

**Step 3: Commit**

```bash
git add app/\(public\)/events/\[id\]/page.tsx
git commit -m "feat(phase-3.5): show QR on existing /events/[id] public page"
```

---

## Task 5: `exportRegistrantsCsv` Server Action

**Files:**
- Modify: `app/events/[id]/edit/actions.ts`

**Step 1: Add the function**

Append to `app/events/[id]/edit/actions.ts`:

```ts
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildCsv } from '@/lib/csv';
// ... and at the bottom of the file:

export async function exportRegistrantsCsv(
  eventId: string,
): Promise<{ csvBase64: string; filename: string } | { error: string }> {
  await requireStaff();
  const supabase = await supabaseServer();

  const { data: event, error: readErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, max_attendees')
    .eq('id', eventId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!event) return { error: 'Event not found.' };

  // "Registration closed" gate: end_time passed OR at capacity.
  // Service-role count because anon has no SELECT on registrations and the
  // organizer's RLS-scoped count would also work; admin is consistent with the
  // public page's capacity-counter pattern.
  const admin = supabaseAdmin();
  const { count: registeredCount } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id);

  const endTimeMs = new Date(event.end_time).getTime();
  const atCapacity =
    event.max_attendees != null && (registeredCount ?? 0) >= event.max_attendees;
  const ended = endTimeMs < Date.now();

  if (!atCapacity && !ended) {
    return { error: 'Registration is not closed yet.' };
  }

  // Service-role row read — organizer has already passed requireStaff and
  // their RLS gates the event read above; the rows-themselves SELECT under
  // admin is consistent with the email-log + capacity-count pattern used
  // elsewhere in the codebase.
  const { data: rows } = await admin
    .from('registrations')
    .select('full_name, email, registered_at')
    .eq('event_id', event.id)
    .order('registered_at', { ascending: true });

  // CSV layout: a small event metadata header, then a blank row, then the
  // table header + data rows. Per design doc §C.
  const metadata: string[][] = [
    ['Event', event.title],
    ['Start', `${event.start_time} (${event.timezone})`],
    ['End', `${event.end_time} (${event.timezone})`],
    ['Venue', event.venue_name],
    ['Total registered', String(registeredCount ?? 0)],
    [''], // blank separator row
    ['full_name', 'email', 'registered_at'],
  ];
  const dataRows: string[][] = (rows ?? []).map(r => [
    r.full_name,
    r.email,
    r.registered_at,
  ]);

  const csv = buildCsv([...metadata, ...dataRows]);
  const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');

  // YYYYMMDD in UTC; filename slugified.
  const slug = slugifyTitle(event.title);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `registrants-${slug || event.id}-${today}.csv`;

  return { csvBase64, filename };
}
```

The function reuses the existing `slugifyTitle` import from earlier in the file.

**Step 2: Run static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint app/events/\[id\]/edit/actions.ts
```

Expected: clean.

**Step 3: Commit**

```bash
git add app/events/\[id\]/edit/actions.ts
git commit -m "feat(phase-3.5): exportRegistrantsCsv server action (closed-gate + base64 CSV)"
```

---

## Task 6: `ExportRegistrantsButton` client component

**Files:**
- Create: `components/ExportRegistrantsButton.tsx`

**Step 1: Implement**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportRegistrantsCsv } from '@/app/events/[id]/edit/actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function ExportRegistrantsButton({
  eventId,
  disabled,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await exportRegistrantsCsv(eventId);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      const href = `data:text/csv;base64,${res.csvBase64}`;
      const a = document.createElement('a');
      a.href = href;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setState({ kind: 'idle' });
    });
  }

  const isLoading = state.kind === 'loading';
  const errorMessage = state.kind === 'error' ? state.message : null;

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={disabled || isLoading}>
        {isLoading ? 'Preparing…' : 'Export registrants (CSV)'}
      </Button>
      {errorMessage && <p className="text-sm text-red-700">⚠ {errorMessage}</p>}
    </div>
  );
}
```

**Step 2: Run static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint components/ExportRegistrantsButton.tsx
```

Expected: clean.

**Step 3: Commit**

```bash
git add components/ExportRegistrantsButton.tsx
git commit -m "feat(phase-3.5): ExportRegistrantsButton client component"
```

---

## Task 7: Wire poster link + CSV button into edit page

**Files:**
- Modify: `app/events/[id]/edit/page.tsx`

**Step 1: Add imports**

```tsx
import ExportRegistrantsButton from '@/components/ExportRegistrantsButton';
```

**Step 2: Compute the close-gate server-side**

Inside `StaffEventEditPage`, after `event` and `blocks` are fetched, compute the gate. Use `supabaseAdmin()` for the count (mirror existing pattern):

```tsx
// Close gate: end_time passed OR at capacity.
const { count: registeredCount } = await (await import('@/lib/supabase/admin'))
  .supabaseAdmin()
  .from('registrations')
  .select('id', { count: 'exact', head: true })
  .eq('event_id', event.id);

const ended = new Date(event.end_time).getTime() < Date.now();
const atCapacity =
  event.max_attendees != null && (registeredCount ?? 0) >= event.max_attendees;
const registrationClosed = ended || atCapacity;
```

Note: prefer a top-of-file import for `supabaseAdmin`. Place `import { supabaseAdmin } from '@/lib/supabase/admin';` near the existing supabase server import. The inline dynamic import above is a placeholder — use the static import in the real code.

Also extend the event SELECT to include `max_attendees` (it isn't currently in the SELECT list at lines 24–25):

```ts
.select('id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees')
```

**Step 3: Add the poster link inside the existing QR section**

Replace the current QR section (lines 119–127 of `page.tsx`) with:

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-sm font-medium text-gray-700 mb-1">QR code</h2>
    <p className="text-sm text-gray-600 mb-3">
      Anyone who scans this lands on the public registration page.
    </p>
    <div className="flex flex-wrap gap-3 items-center">
      <DownloadQrButton eventId={event.id} />
      <a
        className="text-blue-700 underline text-sm"
        href={`/events/${event.id}/poster`}
        target="_blank"
        rel="noreferrer"
      >
        View poster →
      </a>
    </div>
  </section>
)}
```

**Step 4: Add the CSV export section, gated**

Below the QR section (still inside `event.status === 'published'` is fine, but the gate caption applies regardless):

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-sm font-medium text-gray-700 mb-1">Registrant export</h2>
    <p className="text-sm text-gray-600 mb-3">
      {registrationClosed
        ? `Registration closed (${atCapacity ? 'capacity reached' : 'event ended'}). Download the registrant list as CSV.`
        : 'Export becomes available after registration closes (event ends or capacity is reached).'}
    </p>
    <ExportRegistrantsButton eventId={event.id} disabled={!registrationClosed} />
  </section>
)}
```

**Step 5: Run static gates**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint app/events/\[id\]/edit/page.tsx && pnpm exec next build 2>&1 | tail -10
```

Expected: clean. `next build` shows 9 routes.

**Step 6: Commit**

```bash
git add app/events/\[id\]/edit/page.tsx
git commit -m "feat(phase-3.5): edit page wiring — poster link + CSV export button with gate"
```

---

## Task 8: Verification + manual smoke

**Step 1: Full gate sweep**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```

Expected:
- tsc: clean
- eslint: clean
- vitest: **75/75 pass** (65 prior + 10 CSV)
- next build: **9 routes** (was 8; `/events/[id]/poster` added)

**Step 2: Manual smoke (browser)**

User's `pnpm dev` running on http://localhost:3000. Logged in as `ahf.ivan@gmail.com`. Use REPRO-PUB event `cca2897f-3d2e-417e-9bff-ca54b0ed22b6` (published, 0/2 capacity after Phase 3 cleanup).

**Poster page:**
1. Open `http://localhost:3000/events/cca2897f-.../poster` → verify large title, QR visible, agenda + description, register form at the bottom, "Print poster" button at the bottom.
2. Click "Print poster" → browser print preview opens. Verify: register form is hidden, Print button is hidden, layout is A4-ish with the big QR.
3. Open `http://localhost:3000/events/d4aa003b-.../poster` (draft) → **404**.

**QR on existing public page:**
4. Open `http://localhost:3000/events/cca2897f-...` → verify QR appears above the register form. Smaller than the poster (w-32 h-32). Caption "Scan or share…".

**CSV export — gate behaviour:**
5. Edit page for REPRO-PUB (`/events/cca2897f-.../edit`): verify the Registrant export section says "Export becomes available after registration closes…" and the button is disabled. (Event end_time is in the future, capacity is 0/2 not 2/2.)

**CSV export — at-capacity path:**
6. Register two people through the public page to fill REPRO-PUB to 2/2. Reload edit page. Verify the section now says "Registration closed (capacity reached)…" and the button is enabled. Click it. Verify a file `registrants-repro-pub-YYYYMMDD.csv` downloads.
7. Open the CSV — verify:
   - Header rows with Event title, Start, End, Venue, Total registered
   - Blank separator row
   - `full_name,email,registered_at` column header
   - Two data rows for the two registrants
   - No PII leaks (no extra columns)

**Edge case — empty events at-capacity:** N/A (REPRO-PUB has max 2; at-capacity means 2 rows).

**Step 3: If anything fails**

Fix the cause, re-commit per the atomic-commit pattern, re-run gates. Do NOT skip the gate sweep.

**Step 4: Push**

```bash
git push origin main
```

Expected: 7 commits pushed (Tasks 1–7).

**Step 5: Update vault**

After push, mark the Phase 3.5 work in the vault:
- Update `20 — Roadmap/Phased Roadmap.md` — add Phase 3.5 row with ✅
- Create `20 — Roadmap/Phase 3.5 — Poster + CSV.md` summary note (mirror the Phase 3 note structure)
- Remove or strike-through item 7 in `30 — Reference/Out of Scope.md > Backlog parking lot` since it's now shipped

---

## Out-of-scope reminders (do NOT add in this slice)

- Edit-form UI (rename, reschedule, edit agenda) — Phase 3.6 candidate
- `attended` / `registration_code` CSV columns — Phase 4
- Email-the-CSV-to-organizer — Phase 7
- PDF generation server-side (use browser print-to-PDF instead)
- Custom paper size / branding / logo on poster

---

## Verification before completion

Per `superpowers:verification-before-completion`:
1. All gates pass (tsc/eslint/vitest/next build with 9 routes + 75 tests)
2. All manual smoke scenarios above pass end-to-end
3. All commits pushed to `origin/main`
4. Vault updated (Phase 3.5 note + roadmap row + Out-of-Scope item resolved)

If smoke fails at any step, the cause is a real bug — don't paper over it.
