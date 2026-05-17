# Phase 1.5b — New-event form redesign

**Date:** 2026-05-17
**Status:** Design approved; awaiting executable plan (writing-plans next)
**Scope:** `app/events/new/page.tsx` + `components/VenueSearchBox.tsx` + new `components/ui/*` (shadcn)
**Predecessor:** Phase 1.5 form ([4c57e28](app/events/new/page.tsx)) — long scrolling layout, native time inputs, generic Mapbox search

---

## Why

The Phase 1.5 form, smoked manually on 2026-05-17, surfaced three usability issues:

1. **Endless scroll** — all fields are on one screen; user wants sectioned navigation that collapses completed sections into summary cards.
2. **Time picker is generic** — native `<input type="time">` is functional but visually noisy. User referenced Google's restaurant chip grid + Google Calendar pills as the target.
3. **Mapbox doesn't surface local landmarks** — HKCEC and similar HK POIs don't appear. Default search has no geographic bias.

A separate latent bug surfaced during the same smoke: text rendered white-on-white in at least one place (likely the native `<select>` option list).

## Constraints

- **Web app, desktop-primary, mobile-OK** (per [CLAUDE.md](CLAUDE.md): Eventar is "web-only Next.js"; staff usage is mostly laptop with occasional on-site phone use)
- **"Keep it light"** — fix the usability blockers and ship the structural change. No decorative work, no animations, no dark mode, no auto-save, no microcopy polish.
- **No deviation from CLAUDE.md hard rules** — `requireStaff()`, three-layer validation, single-`main` branch, all unchanged.
- **Honour the existing Server Action contract** — `createEvent({event, blocks})` shape from [actions.ts](app/events/new/actions.ts) is the source of truth; the redesigned form must produce the same payload.

## Out of scope

- Dark mode
- Animations / motion / transitions
- Auto-save to localStorage
- Per-block accordion-within-accordion
- Microcopy polish, empty-state illustrations
- Edit page ([app/events/[id]/edit/page.tsx](app/events/[id]/edit/page.tsx)) or public page ([app/(public)/events/[id]/page.tsx](app/(public)/events/[id]/page.tsx)) redesign — those landed in Tasks 9–10 and are not revisited here

---

## Navigation pattern: accordion with summaries

Five sections become four (Review & Save dropped per design discussion; the sticky bottom bar serves that role):

| # | Section | Fields | Valid when | Collapsed summary |
|---|---|---|---|---|
| 1 | **Basics** | title, topic (tag), description, capacity | title non-empty | `{title} · {capacity ?? '—'} max` |
| 2 | **Venue** | `<VenueSearchBox>` → `Venue` | venue non-null | `📍 {name} — {city}, {country}` |
| 3 | **Date & Time** | date input, start chip grid, duration chip group | date+start+end set; end>start | `{Day, DD Mon}, {start}–{end} ({duration})` |
| 4 | **Program** | agenda blocks (rich + filler) | always (0 blocks allowed for draft) | `{N} components · {M} breaks{parallel ⚠ if any}` |

**Behaviour:**
- One section open at a time; click any header to expand (siblings auto-collapse).
- Each section has an explicit **"Done"** button at the bottom that collapses it and advances focus to the next pending section. (No surprise auto-collapse on blur — chosen for predictability, against "jumpy" feel.)
- Sticky bottom bar:
  - Progress dots (●●●○ → ●●●●)
  - Inline form-level error display
  - **"Save as draft"** button — disabled until sections 1–3 are valid (Program is optional for a draft)

**Why accordion over wizard:** the user wanted freedom to fill sections in any order. Wizard's strict gating would also force a "back" button cascade that complicates state. Accordion is the right level of structure for this user's flow.

## Date & Time chip-grid spec

```
Date            [Sun, 17 May ▾]
                 ↑ native <input type="date"> wrapped to look like a pill
                   (native picker UX is excellent on both desktop and mobile)

Start time      ┌────┬────┬────┬────┬────┬────┬────┐
                │08:00│08:30│09:00│09:30│10:00│10:30│11:00│ …  ← horizontal scroll on overflow
                └────┴────┴────┴────┴────┴────┴────┘
                ToggleGroup, single-select; 30-min increments 06:00–22:00

Duration        [30m] [1h] [2h] [4h] [8h] [custom]
                ToggleGroup; "custom" reveals an <input type="time"> for arbitrary end

                → Ends 17:00 (computed, displayed below)
```

**Why hybrid (date pill + chip grid + duration chips):**
- Dates are picked once and demand a calendar (native does this well).
- Workshop start times cluster on round boundaries (chips are faster than typing).
- Duration is the user's actual mental model ("a 2-hour workshop"), not "end time" — chips match the model.
- "Custom" escape hatch keeps the flexibility of free time entry.

**30-min granularity, 06:00–22:00 window** — covers realistic workshop hours. If the user needs finer granularity later, "custom" handles it.

## Per-block timing (inside Program section)

Native `<input type="time">` stays for agenda block start/end. The chip pattern earns its complexity for the event-level decision (a single key field); inside per-block editors with N rows, chips would add scroll noise without value.

The parallel-block badge from Phase 1.5 stays (via `findParallelBlockIds` in [lib/agenda.ts](lib/agenda.ts)).

## Mapbox tune (the HKCEC fix)

```tsx
// components/VenueSearchBox.tsx — only `options` changes
<SearchBox
  accessToken={token}
  options={{
    proximity: { lng: 114.1694, lat: 22.3193 },  // Victoria Harbour
    language:  'en',
    types:     'poi,address,place',
    limit:     10,
    // no country filter — global fallback retained
  }}
  value={value}
  onChange={setValue}
  onRetrieve={...}
  placeholder="Search for a venue, hotel, or address…"
/>
```

**Why these knobs:**
- `proximity` is the single highest-leverage knob — biases ranking toward HK without restricting matches. HKCEC will surface in the top results.
- `language: 'en'` — explicit, deterministic results. (Mapbox may also accept comma-separated, e.g. `'en,zh-Hant'`; will verify against the installed `@mapbox/search-js-react` types during impl. If supported, add Traditional Chinese as a secondary so localised names still match.)
- No country filter — preserves global fallback ("type a Tokyo address, get Tokyo results"). User's chosen scope.

## White-on-white audit + fix

The likely culprit is the native `<select>` for "+ Add component" in the Program section — browser default `<option>` rendering can be unreadable depending on OS theme + Tailwind reset interaction. Replacing with shadcn's `<Select>` (Radix-backed, fully styled) resolves it categorically.

During implementation also pass over:
- Placeholder colors (Tailwind `placeholder:text-gray-400` if not already)
- Disabled-button text (current `disabled:opacity-50` is fine)
- Focus rings (shadcn provides consistent rings by default)
- Safari's `<input type="date">` placeholder bug

## Component inventory (shadcn/ui copy-ins)

```
components/ui/
  accordion.tsx        ← Section navigation
  button.tsx           ← Submit, "Done", "Add component", etc.
  input.tsx            ← Title, capacity, description-summary, etc.
  textarea.tsx         ← Description
  select.tsx           ← "+ Add component" dropdown (fixes white-on-white)
  toggle-group.tsx     ← Start-time chips, duration chips
lib/utils.ts           ← cn() helper (shadcn convention)

new npm deps:
  class-variance-authority   clsx   tailwind-merge   lucide-react
  @radix-ui/react-accordion  @radix-ui/react-select  @radix-ui/react-toggle-group
```

**Explicitly NOT added:**
- Calendar / DayPicker (native date input is sufficient)
- Dialog, Card, Tooltip, Popover, Toast — out of scope
- Form / react-hook-form — current `useState` per-field model is fine for this scope; introducing a form library is "novelty over convention" (CLAUDE.md rule 11)

## State model

```ts
// app/events/new/page.tsx (sketch — full file in plan)
type Section = 'basics' | 'venue' | 'datetime' | 'program';
const [openSection, setOpenSection] = useState<Section | null>('basics');

// Section data — mostly unchanged from Phase 1.5 form
const [name, setName] = useState('');
const [topic, setTopic] = useState('');
const [description, setDescription] = useState('');
const [capacity, setCapacity] = useState('');

const [venue, setVenue] = useState<Venue | null>(null);

const [date, setDate] = useState('');           // YYYY-MM-DD
const [startTime, setStartTime] = useState(''); // HH:MM
const [duration, setDuration] = useState<DurationKind>('1h');  // chip
const [customEnd, setCustomEnd] = useState(''); // when duration === 'custom'
const endTime = useMemo(() => deriveEnd(startTime, duration, customEnd), [...]);

const [blocks, setBlocks] = useState<BlockDraft[]>([]);

// Section validity predicates
const basicsValid   = name.trim().length > 0;
const venueValid    = venue !== null;
const datetimeValid = date && startTime && endTime && endTime > startTime;
const canSubmit     = basicsValid && venueValid && datetimeValid;
```

Submit assembles the same `{event, blocks}` payload as Phase 1.5 and calls `createEvent(...)`. No Server Action changes.

## Testing

- **Unit tests:** add `deriveEnd(startTime, duration, customEnd)` as a pure helper in `lib/time.ts` with 6–8 cases (basic durations, custom path, midnight wrap, missing inputs). TDD-style, no DOM.
- **Existing tests:** all 39 must still pass (no Server Action changes, no Zod schema changes).
- **Manual smoke (Task 12b):** the user re-runs the 10-step Mapbox checklist after impl, plus three new steps for the accordion: section auto-collapse on Done, sticky-bar enable/disable, all-required-set-but-program-empty allowed.

## Risk register

| Risk | Mitigation |
|---|---|
| shadcn/ui Tailwind v4 compatibility | shadcn officially supports v4 since late 2025; verify installed version's `components.json` matches our `tailwindcss@4` + `@tailwindcss/postcss@4` before adding components. |
| `language: 'en,zh-Hant'` rejection by Mapbox v1.5 | Read installed `.d.ts` for `SearchBoxOptions` first (same pattern that caught Phase 1.5's `context` shape mismatch); fall back to `'en'` if multi-lang not supported. |
| `<input type="date">` styled-as-pill cross-browser quirks | Accept native widget on each platform; don't try to fully restyle. The native picker on macOS / iOS / Android / Windows is consistent enough for our use. |
| Section auto-expand on validity change creating focus loops | Validity → "next section is now reachable" UI hint only (highlight, not auto-open). User must click Done to advance. |
| `next build` failing on shadcn primitives that use peer deps | Run `next build` after each component is added to catch issues incrementally rather than as one big-bang verification at the end. |

## Hard rules carried over from Phase 1.5

All still apply, unchanged:
1. `'use client'` on the page; client state managed via `useState` / `useMemo`.
2. Submit calls the Server Action `createEvent({event, blocks})`; no FormData path.
3. Server Action is the authoritative Zod validator (three-layer rule: form `required` → Zod → DB constraints).
4. `requireStaff()` at the top of Server Actions; Proxy gates `/events/new` per [proxy.ts](proxy.ts).
5. No PII in logs; no secrets in code; service-role key stays in `lib/supabase/admin.ts`.

---

## Next step

Invoke `superpowers:writing-plans` to convert this design into a bite-sized, TDD-ordered task list. Implementation begins from that plan, not directly from this design doc.
