# Phase 3.5 — Public Poster Page + CSV Registrant Export (Design)

**Date:** 2026-05-22
**Phase scope:** Two read-side / presentation features that build on existing Phase 2 + 3 surfaces. No new tables, no migrations.
**Estimate:** ~½ day (smaller than Phase 3 in code volume; bigger in print-CSS fiddling).

> [!info] Brainstorm-driven design
> All forks locked via structured Q&A before any code:
> - **Poster route:** separate `/events/{id}/poster` (public) — not a staff route, not a modal on the edit page
> - **QR placement:** on `/poster` *and* on existing `/events/{id}` (reversible later)
> - **Form on poster:** yes — same register form as `/events/{id}`
> - **CSV trigger:** "registration closed" = `end_time < now() OR registered_count >= max_attendees` (whichever first)
> - **CSV columns (this phase):** `full_name, email, registered_at` + event metadata header. `attended` + `registration_code` deferred to Phase 4.
> - **CSV download:** Server Action returns base64; client triggers `<a download>` (mirror Phase 3 QR pattern).
> - **Edit-form UI** (rename/reschedule/agenda edit): deferred — out of scope for 3.5.

---

## What this phase delivers

1. **`/events/{id}/poster`** — public, printable poster view with the QR rendered inline and the same register form as `/events/{id}`. Print button + print CSS. Staff edit page links to it.
2. **QR added to `/events/{id}`** — same image as the poster, inline. Same QR generation path (`getEventQrPng()`).
3. **CSV registrant export** — staff button on edit page; visible only when registration is "closed" (capacity OR time gate). Downloads `registrants-<slug>-<YYYYMMDD>.csv`.

That's the phase.

---

## A. Public poster page — `/events/{id}/poster`

### Route
`app/(public)/events/[id]/poster/page.tsx` — server component. Public access; anon RLS on `events` already restricts to `status='published'` so drafts return notFound() naturally.

### Data
Same SELECT as the existing public page (`/events/[id]/page.tsx`): `id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees` plus `agenda_blocks` for the agenda section.

### QR generation
Reuse `getEventQrPng()` from `app/events/[id]/edit/actions.ts`. **Problem:** it currently calls `requireStaff()`. We have two options:
- (a) Make the existing action public (drop `requireStaff`) — risky, breaks Phase 3's Defense in Depth posture.
- (b) **Extract a public helper** `lib/qr.ts` exporting `buildEventQrPng(event: { id: string; title: string }, origin: string)` that does the QRCode.toBuffer + slug work. Both `getEventQrPng()` (staff) and the poster page (public) call it. ✅

Decision: **(b)**. The auth + RLS gating stays in the calling layer. The pure QR-byte generation is library glue.

```ts
// lib/qr.ts (new)
export async function buildEventQrPng(
  event: { id: string; title: string },
  origin: string,
): Promise<{ pngBase64: string; filename: string }>
```

The poster page calls this directly with the event row it already fetched.

### Layout
- Large title (~3xl), centred
- Date/time/venue block underneath
- QR image (~256px on screen, source PNG is 512px so it stays crisp on zoom/print)
- Agenda (if present)
- Description
- Register form (same component as `/events/{id}`)
- "Print poster" button → `window.print()`

### Print CSS
Tailwind print: prefix. Hide:
- Site nav (if added later)
- Print button itself (`print:hidden`)
- Register form (controversial — see open question §C)

Force:
- A4 page size via `@page { size: A4; margin: 16mm; }` (or Letter — see open question §C)
- `print:text-black print:bg-white` to override any dark-mode styles
- Bigger QR on print (`print:w-80 print:h-80`)

### Auth
None — `RLS` already filters to published events. If someone requests `/events/<draft-id>/poster`, the SELECT returns no row → `notFound()`. Same surface area as `/events/{id}`.

### Edit page link
On `app/events/[id]/edit/page.tsx`, inside the existing `event.status === 'published'` QR section, add a "View poster →" anchor alongside "Download QR".

---

## B. QR on the existing public registration page

`app/(public)/events/[id]/page.tsx` gets a new section above the register form:

```tsx
<section>
  <h2 className="text-sm font-medium text-gray-700 mb-1">Scan to share</h2>
  <img
    src={`data:image/png;base64,${pngBase64}`}
    alt="QR code for this event"
    className="w-48 h-48"
  />
</section>
```

QR is rendered server-side in the same page render (one round trip). Buffer is small (~3–5 KB → ~6 KB base64) so inlining is fine.

This is the "QR on both pages" outcome from clarification. Reversible later by removing this section.

---

## C. CSV registrant export

### Trigger
"Registration closed" = `event.end_time < now() OR (event.max_attendees IS NOT NULL AND registered_count >= event.max_attendees)`.

Computed server-side at edit-page render time. Button hidden when not satisfied; shown enabled when satisfied. No new schema field.

### Server Action
New `exportRegistrantsCsv(eventId: string)` in `app/events/[id]/edit/actions.ts`:
- `await requireStaff()`
- SELECT event by id (RLS gates organiser/manager)
- Apply the close gate; if not satisfied → `{ error: 'Registration is not closed yet.' }`
- SELECT registrations (full_name, email, registered_at) for the event — RLS via service-role OR via the organiser's RLS-allowed read (existing pattern is service-role for count; here we want the rows themselves — use service-role since the organiser already passed `requireStaff` + RLS verified ownership of the event)
- Build CSV string with header rows:
  ```
  Event,<title>
  Start,<formatted start_time in event timezone>
  End,<formatted end_time in event timezone>
  Venue,<venue_name>
  Total registered,<count>

  full_name,email,registered_at
  Alice,alice@example.com,2026-05-21T08:42:00Z
  ...
  ```
- Base64-encode the bytes
- Filename: `registrants-${slugifyTitle(event.title) || event.id}-${YYYYMMDD}.csv`
- Return `{ csvBase64, filename }` or `{ error }`

### CSV escaping
Use a tiny escape helper (no library — YAGNI): wrap any field containing `,`, `"`, or `\n` in double quotes and double up internal `"`. Pure function; unit-tested.

### Client component
`components/ExportRegistrantsButton.tsx` — mirrors `DownloadQrButton.tsx`:
- `idle | loading | error` state machine
- onClick → action → if `csvBase64`, build `data:text/csv;base64,...` and trigger synthetic `<a download>`
- Disabled when gate not satisfied (parent passes `disabled` prop)

### Where it renders
Edit page, in the existing `event.status === 'published'` section. New subsection "Registrant export" with a one-line caption explaining when it becomes available. Button:
- Hidden / disabled when gate not satisfied (subsection still visible with a "Export available after registration closes (event end OR capacity)." caption)
- Enabled when gate satisfied; clicking downloads

### PII note
The CSV contains attendee names + emails. PII handling:
- Server Action runs under organiser auth + RLS — only the event owner / manager can call it
- Base64 returned to the organiser's browser; no third party
- Filename and console logs are UUIDs/slug only (CLAUDE.md rule 10)
- The CSV itself is PII by definition; downloading is the explicit user intent

Acceptable.

---

## Architecture diagram

```
                                          ┌───────────────────────────────────────┐
/events/[id]/page.tsx          (existing)  │ Renders: info + register form
                                          │ NEW: QR <img src="data:image/png;base64..."> from buildEventQrPng()
                                          └───────────────────────────────────────┘

                                          ┌───────────────────────────────────────┐
/events/[id]/poster/page.tsx   (NEW)       │ Renders: large title + QR + agenda + description + register form
                                          │ + Print button (window.print())
                                          │ + Print CSS hides chrome, A4 layout
                                          └───────────────────────────────────────┘

                                          ┌───────────────────────────────────────┐
lib/qr.ts                       (NEW)      │ buildEventQrPng(event, origin) — pure-ish glue
                                          │   QRCode.toBuffer(`${origin}/events/${event.id}`, …)
                                          │   slugifyTitle(event.title)
                                          │   returns { pngBase64, filename }
                                          └───────────────────────────────────────┘
                                                                ▲
                                                                │ called by:
                                                                │   - app/events/[id]/edit/actions.ts::getEventQrPng (staff)
                                                                │   - app/(public)/events/[id]/page.tsx (public)
                                                                │   - app/(public)/events/[id]/poster/page.tsx (public)

                                          ┌───────────────────────────────────────┐
app/events/[id]/edit/actions.ts            │ NEW: exportRegistrantsCsv(eventId)
                                          │   requireStaff() → RLS event read → gate check → SELECT registrations (service-role) → CSV → base64
                                          └───────────────────────────────────────┘

                                          ┌───────────────────────────────────────┐
components/ExportRegistrantsButton.tsx     │ NEW: client component, mirror of DownloadQrButton
                                          └───────────────────────────────────────┘

                                          ┌───────────────────────────────────────┐
lib/csv.ts                      (NEW)      │ NEW: csvEscape(field) + buildCsv(rows) pure helpers
                                          │ Unit-tested (~5 cases)
                                          └───────────────────────────────────────┘
```

---

## Open questions to resolve during implementation

These are real choices but don't block design approval; they get answered as we build:

1. **Paper size:** A4 (Australian default) vs. Letter (US). Default A4; revisit if a US customer materialises.
2. **Print CSS — register form visible?** Could go either way:
   - **Hide on print:** "this is a poster, scan to register" — cleaner
   - **Show on print:** someone could fill it in by hand and email it back — niche
   - Default: hide on print. Easy to flip.
3. **Empty-events case:** if a published event has 0 registrants and registration is closed, CSV still exports (just header + zero data rows). Document this; don't special-case it.
4. **Event title with weird chars in CSV header:** `csvEscape` handles it. Just confirm with a test (e.g. title with a comma + quote).
5. **Manager vs organiser scope:** `requireStaff()` accepts both. RLS already filters which events each can read. CSV inherits that. No new check needed.

---

## Testing strategy

| Test | File | Layer |
|---|---|---|
| `csvEscape` — 5 cases (no-escape, comma, quote, newline, all-three) | `lib/csv.test.ts` | unit |
| `buildCsv` — header + body, empty rows, varied row count | `lib/csv.test.ts` | unit |
| Print-CSS visual check | manual smoke | n/a |
| Poster page renders for published event | manual smoke | integration |
| Poster page 404s for draft | manual smoke | integration |
| CSV button hidden before close gate | manual smoke | integration |
| CSV button enabled after close gate (manually pass end_time or hit capacity) | manual smoke | integration |

No vitest for the Server Actions themselves — project convention is pure-piece unit tests + manual smoke for actions (carried over from Phase 3).

---

## Out of scope (deferred)

- Edit-form UI (rename/reschedule/agenda edit) — Phase 3.6 candidate
- `attended` and `registration_code` columns in CSV — Phase 4 extends `exportRegistrantsCsv`
- Email-the-CSV-to-organiser — Phase 7
- CSV-on-demand from the dashboard (cross-event analytics) — Phase 6
- Logo / branding on the poster — would be a Step-2-commercialisation feature (see `Commercialisation Proposal.md`)
- Custom paper size selector — YAGNI
- PDF generation server-side — print-to-PDF in the browser is fine

---

## Verification before completion

Per `superpowers:verification-before-completion`:
1. All gates pass: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`
2. Manual smoke (5 scenarios above) passes
3. `next build` shows the new `/events/[id]/poster` route (9 routes total — was 8)
4. Commits pushed to `origin/main`

If smoke fails, the cause is a real bug — don't paper over it.

---

## Next step

Invoke `superpowers:writing-plans` to convert this design into a bite-sized TDD plan.
