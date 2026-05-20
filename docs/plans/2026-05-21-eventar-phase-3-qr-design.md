# Phase 3 — Publish + Static QR (Design)

**Date:** 2026-05-21
**Phase scope:** QR slice only. Full edit-form UI (rename / reschedule / edit agenda) deferred to Phase 3.5.
**Estimate:** ~½ day. 5 file touches. 1 new npm dep (`qrcode`).

> [!info] Brainstorm-driven design
> Forks locked via the brainstorming skill before any code:
> - **QR count:** one (encodes `/events/{id}` — the existing public info+register page).
> - **Storage:** inline base64 data URL. No Supabase Storage bucket.
> - **Status gate:** published events only. Drafts have no QR controls.
> - **Scope:** download button + thumbnail. No "two-QR for info-vs-register-only" route.

---

## What this phase delivers

A "Download QR" button on the staff edit page of a **published** event. Clicking it downloads `event-<title-slug>.png` — a 512×512 QR code that, when scanned, opens `${origin}/events/{id}` (the public info+register page). The button only appears on published events.

That's the entire phase. Phase 7 (Resend) can later embed the same QR in confirmation emails; Phase 4 (check-in) is an independent surface and doesn't depend on this.

## Architecture

One async Server Action + one tiny client component. No new routes, no new tables, no Supabase Storage.

```
                       ┌──────────────────────────────────────────────────┐
edit/page.tsx          │  Renders DownloadQrButton iff event.status='published'
                       └──────────────────────────────────────────────────┘
                                            │
                                            ▼  (client onClick → server action)
                       ┌──────────────────────────────────────────────────┐
edit/actions.ts        │  getEventQrPng(eventId):
                       │    1. requireStaff()
                       │    2. SELECT event (RLS-gated — must be owned/manager)
                       │    3. Check event.status === 'published'
                       │    4. Build absolute URL from request headers
                       │    5. qrcode.toBuffer(url) -> base64
                       │    6. Return { pngBase64, filename }
                       └──────────────────────────────────────────────────┘
                                            │
                                            ▼
                       ┌──────────────────────────────────────────────────┐
DownloadQrButton.tsx   │  Builds <a href="data:image/png;base64,..."
                       │   download="event-<slug>.png"> and click()s it
                       └──────────────────────────────────────────────────┘
```

## Component specs

### `lib/slugify.ts` (NEW)
Pure function `slugifyTitle(title: string): string`. Behaviour:
- Trim whitespace
- Lowercase
- Replace any run of non-alphanumeric characters with a single `-`
- Strip leading/trailing `-`
- Cap at 60 chars (truncated to last full word if possible)
- If result is empty (title was all symbols/whitespace), return `''` — caller falls back to id-based filename

Unit-tested in `lib/slugify.test.ts`. ~6 cases (normal title, leading/trailing spaces, symbols-only, unicode, length cap, empty).

### `app/events/[id]/edit/actions.ts` (extended)
New async export:
```ts
export async function getEventQrPng(
  eventId: string,
): Promise<{ pngBase64: string; filename: string } | { error: string }>;
```

Flow:
1. `await requireStaff()` — CLAUDE.md hard rule 3.
2. SELECT event by id using `supabaseServer()` (authenticated client). RLS chain (`events_manager_read_all` OR `events_organizer_select_own` OR `events_public_read_published`) gates the read.
3. If `!data` → return `{ error: 'Event not found.' }`. Silent-failure-visibility pattern from `publishEvent`.
4. If `data.status !== 'published'` → return `{ error: 'QR is available after publishing.' }`. Defense-in-depth — the UI also gates this.
5. Build `origin` from request headers (`x-forwarded-proto` + `host`), same pattern as `sendMagicLink`.
6. `const buf = await QRCode.toBuffer(\`${origin}/events/${eventId}\`, { errorCorrectionLevel: 'M', width: 512, margin: 2 });`
7. Build filename: `event-${slugifyTitle(data.title) || data.id}.png`.
8. Return `{ pngBase64: buf.toString('base64'), filename }`.

No error try/catch beyond the explicit branches — `QRCode.toBuffer` only fails on programmer error (invalid encoder options), not on user input, so any throw bubbles up and Next renders the error boundary (which is correct behaviour for "this should never happen" classes of error).

### `components/DownloadQrButton.tsx` (NEW)
Client component, ~30 lines. Props: `{ eventId: string }`.

State machine: `idle | loading | error`.

On click:
1. `setState('loading')`
2. `const res = await getEventQrPng(eventId)`
3. If `'error' in res`: `setState({ kind: 'error', message: res.error })`
4. Else: build `<a href="data:image/png;base64,${res.pngBase64}" download="${res.filename}">`, append to body, click(), remove. `setState('idle')`.

Button labels: `Download QR` (idle), `Preparing…` (loading), red banner above button when error.

No thumbnail in the initial cut — the thumbnail variant in section 5 of the brainstorm is deferred; download button alone is enough for the MVP path. Easy follow-up if useful.

### `app/events/[id]/edit/page.tsx` (extended)
New section below the existing Publish button, **conditional on `event.status === 'published'`**:

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-lg font-medium mb-2">QR code</h2>
    <p className="text-sm text-gray-600 mb-3">
      Anyone who scans this lands on the public registration page.
    </p>
    <DownloadQrButton eventId={event.id} />
  </section>
)}
```

## Authorization

Three layers as usual:
1. **`requireStaff()`** at top of Server Action — blocks unauthenticated callers.
2. **RLS** on the events SELECT — only the organizer (`created_by = current_staff_id()`) or a manager (`is_manager()`) gets a row. Now schema-qualified to `app_private.*` after the pre-Phase-3 audit fix.
3. **Status check** — explicit `event.status === 'published'` guard inside the action even though the UI gates the button. Belt + braces against future refactors that might expose this action elsewhere.

There is no PII in any error message returned to the client — generic `'Event not found.'` / `'QR is available after publishing.'`.

## URL construction

Same `x-forwarded-proto` + `host` headers pattern that `sendMagicLink` already uses. Works on:
- `localhost:3000` (dev)
- `*.vercel.app` (preview, Phase 8)
- Custom domain (prod, Phase 8)

No new env var needed. If we ever want to override (e.g. behind a corporate proxy that strips `x-forwarded-proto`), we add `NEXT_PUBLIC_BASE_URL` later — YAGNI for now.

## Testing

| Test | File | Layer |
|---|---|---|
| `slugifyTitle` — 6 cases | `lib/slugify.test.ts` | unit |
| Server Action returns error on `requireStaff` reject | `app/events/[id]/edit/actions.test.ts` | integration (mocked auth) |
| Server Action returns error on draft event | same | integration |

Not tested (trust the library / trivial glue):
- `qrcode` encoding correctness — library responsibility.
- `<a download>` DOM mechanics in `DownloadQrButton` — trivial DOM, no logic worth testing.

## Manual smoke checklist (post-implementation)

1. Open `/events/{id}/edit` for a draft → no QR section visible.
2. Publish the event → page revalidates → QR section now visible below Publish (which itself disappears).
3. Click "Download QR" → file downloads as `event-<title-slug>.png` (~3-5KB).
4. Open the PNG → scan with phone camera → lands on `/events/{id}` public page with the inline registration form.
5. Register from the scanned page → success (Phase 2 flow, unchanged).
6. Try `getEventQrPng` for an event owned by a different organizer (impersonating via dev tools) → "Event not found." (RLS does its job).

## Out of scope (deferred to Phase 3.5+)

- Full edit-form UI (rename, reschedule, edit agenda) — Phase 3.5
- Second QR for register-only `/events/{id}/register` — only if a print-poster use case emerges
- Embedded QR in confirmation emails — Phase 7
- Supabase Storage-backed QR (for email embedding) — Phase 7
- Visible capacity counter on public page — Phase 2 Q1 (deferred)
- QR styling customisation (colors, logo embed) — not needed for internal workshops

## Next step

Invoke `writing-plans` skill to convert this design into a step-by-step implementation plan with explicit TDD ordering.
