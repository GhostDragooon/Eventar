# Eventar Design Patterns
_Living document. Each section captures: the user's intent → the resulting pattern → where it applies._
_Started 2026-06-05 during the Geist + Vercel-canonical redesign._

---

## Source-of-truth tokens

| Token | Light | Dark | Notes |
|---|---|---|---|
| Primary | `#0A0A0A` (near-black) | `#FFFFFF` (white) | Inverted polarity |
| On-primary | `#FFFFFF` | `#0A0A0A` | Pairs with primary |
| Accent | `#0070F3` (Vercel blue) | `#3291FF` (brighter, +contrast) | One-step lift for dark |
| Background | `#FFFFFF` | `#000000` (pure black, not near-black) | Vercel canonical |
| Surface | `#FFFFFF` | `#0A0A0A` | One step lighter than bg in dark |
| Surface-container | `#FAFAFA` | `#171717` | Card backgrounds |
| Border | `#EAEAEA` | `#262626` | Subtle |
| Text fg | `#0A0A0A` | `#FAFAFA` | Primary text |
| Text fg-muted | `#525252` | `#A1A1AA` | Secondary text |
| Text fg-dim | `#8F8F8F` | `#71717A` | Tertiary / labels |
| Text fg-faint | `#A1A1AA` | `#525252` | Footer credits |
| Popped RC bg | `#FFFBEB` (amber-50) | `#1F1A14` (warm-black) | Inverts highlight polarity |
| Popped RC border | `#FED7AA` (orange-200) | `#92400E` (orange-800) | |
| Popped RC text | `#7C2D12` (orange-900) | `#FCD34D` (amber-300, golden) | |

## Spacing rhythm

```css
:root {
  --gap: 24px;     /* between major elements (sections, cards, paragraphs) */
  --gap-sm: 8px;   /* sub-rhythm — currently unused (see "Mistakes to avoid") */
}
```

Single-variable spacing. Change `--gap` once, every page updates. Container pattern:

```css
.container {
  max-width: 480px;        /* mobile-first; tablet 880px; email 600px */
  margin: 0 auto;
  padding: var(--gap);     /* 24px on all sides — matches between-item rhythm */
  display: flex;
  flex-direction: column;
  gap: var(--gap);         /* 24px between EVERY direct child */
}
```

## Typography

- **Sans:** Geist (single family, all weights 400-800)
- **Mono:** Geist Mono (matched companion, 500/600/700)
- **No Inter mixing** in production code (Inter used only for nav chrome in audit mockups; production = Geist only)
- **Line-height:** `1.6` for body, `1.15` for hero titles, `1.4` for small meta
- **Letter-spacing:** `-0.02em` for hero, `-0.01em` for tight, `0.02em-0.18em` for uppercase labels

### Body text
```css
.body-text {
  font-size: 15px;
  line-height: 1.6;
  margin: 0;          /* gap handles spacing, never margin */
}
```

### Hero title
```css
.hero-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
}
```

---

## Locked patterns

### 1. Event meta — 2-row format
**User comment (2026-06-05):** *"PE-4: break into 2 rows, row1 address row 2 date and time"*

```html
<div class="event-summary">
  <p class="event-summary-title">Onboarding Workshop for New Engineers</p>
  <p class="event-summary-address">Workspace Studio, Level 4</p>      <!-- row 1 -->
  <p class="event-summary-when">                                       <!-- row 2 -->
    <span class="accent-text">Thu 18 Jun · 09:00–11:00 SGT</span>
  </p>
</div>
```

- Row 1: **address only** (muted)
- Row 2: **date and time** (date accent-colored)
- Capacity ("32 of 60 registered") dropped — moved to status pill if needed (PE-2 territory)

**Applies to:** PE-4 (public event hero), PR-7 (post-register summary), EM-4 (email event card), CI-4 (check-in event meta), ED-2 (event details header)

### 2. Brand footer — single-line uniform "By Eventar"
**User comment (2026-06-05):** *"PR-1 to the bottom of the page, get rid of border. and move the words to the middle 'By Eventar'. apply this to all pages."* + *"PR-1: 1 line uniform font, make it look clean"*

```html
<div class="by-eventar">
  <span class="brand">By Eventar</span>
</div>
```

```css
.by-eventar {
  text-align: center;
}
.by-eventar .brand {
  font-family: 'Geist', sans-serif;
  font-size: 12px;
  color: var(--fg-dim);
  font-weight: 500;
  letter-spacing: 0.02em;
}
```

- **Single line. Single font (Geist). Single weight (500). Single color (`--fg-dim`).**
- No top app bar with Eventar brand
- No two-line "BY / Eventar" credit stack
- No border
- Just sits at the bottom of the content flow with the same `--gap: 24px` above as every other rhythm step

**Applies to:** ALL public attendee pages (PE, PR, EM, CI, SV, LG, PO)
**Outstanding question (flagged on Page 7 DB):** how staff pages handle navigation chrome without a topbar. Likely a small inline action row at top of content area, NOT a sticky bar.

### 3. 3-sentence stack — break for clarity, no double-spacing
**User comments (2026-06-05):** *"PR-4 break it into 3 lines for clarity. one sentence a line."* + *"PR-4 whats with all the gap inbetween the lines"*

```html
<div class="sentence-stack">
  <p class="body-text">A confirmation has been sent to <strong>jane@example.com</strong>.</p>
  <p class="body-text">Please scan the QR code at the counter on the day.</p>
  <p class="body-text">Alternatively, you may present the code below for manual check-in.</p>
</div>
```

```css
.sentence-stack {
  display: flex;
  flex-direction: column;
  gap: 0;     /* line-height handles spacing — DO NOT add gap (see mistakes) */
}
```

- Each sentence on its own `<p>` element (semantic, screen-reader friendly)
- **gap: 0** — line-height (1.6) already provides ~9px effective gap between glyph bottoms
- Adding `gap: 8px` was a mistake → double-spaced effect (17px effective gap)
- Compound clauses split with periods (semicolon → period + capital)
- Only the key data (email, code) bolded; instructions plain

**Applies to:** PR-4 (post-register body), EM-7 (email body), CI body text, SV intro

### 4. Information architecture — situational anchor before practical details
**User comment (2026-06-05):** *"move PR-7 after PR-3 then the rest"*

Order matters. On a confirmation page:
- ✅ Pill → Hero → **Event card** → Email confirm → Reg code → CTA → Fine print → Footer
- ❌ ~~Pill → Hero → Email confirm → Reg code → CTA → Event card → Fine print~~

After the success acknowledgement, the brain asks "what did I commit to?" — the event card answers immediately. Then practical details (email sent, code, calendar) follow.

**Applies to:** PR (post-register), EM (email reading order), CI (check-in arrival)

### 5. Equal-gap rhythm — single `--gap` authority
**User comment (2026-06-05):** *"equal gap between each item please"*

```css
.container {
  display: flex;
  flex-direction: column;
  gap: var(--gap);  /* every element gets equal spacing */
}
.hero-title, .body-text, .small-meta { margin: 0; }  /* reset internal margins */
```

- Container is a flex column with `gap: var(--gap)` (24px)
- All text elements have `margin: 0` (global reset) so element-internal margins don't compound with gap
- Container padding matches gap value — edges share rhythm

**Applies to:** Every page container.

### 6. EE form — timezone auto-derived from venue (no UI control)
**User direction (2026-06-08, Page 7 review):** *"timezone should be automated according to the venue, be sure to note down the logic and get rid of EE-D3."*

The Event Create/Edit form does NOT expose a timezone picker. The event's timezone is **derived once at venue-pick time** and stored on the event row. Logic:

1. **At venue pick** — Mapbox returns the lat/long. Client calls a server-side IANA lookup (`tz-lookup` npm package, or a thin Mapbox/Google Timezone API wrapper — see Decisions Log when implemented) using `(latitude, longitude)` → IANA string (e.g. `Asia/Singapore`).
2. **Stored** on `events.timezone` (text, IANA) at the same write as `venue_name` / `latitude` / `longitude`.
3. **Display** throughout the app (PE, EM, CI, SV, dashboards) renders all event-time strings against the stored IANA zone using `Intl.DateTimeFormat`. See vault `10 — Architecture/Timezone Handling.md`.
4. **Override** — none in this phase. If a venue is in the wrong zone (rare — would require a misplaced Mapbox result), the fix is to re-pick the venue. Adding an override later is cheap; adding one prematurely creates a "two sources of truth" bug class.

**Why no UI:**
- The single legitimate source of truth for an event's local time is its venue. Showing a picker invites mistakes where the picker disagrees with the venue.
- One less field means one fewer way for the form to be invalid.
- Matches the Rule-12 mindset: surface the venue-pick failure (no result, wrong country) instead of letting the user paper over it with a manual zone override.

**Applies to:** EE (create + edit). Does NOT apply if/when we ship remote-attendee events with no physical venue — that's a separate flow.

### 7a. Color-as-meaning system — one color per concept (cross-page rule)
**User direction (2026-06-08, Page 8 review):** *"have designated color for each status, so much green in there I dont know which is which. dont mix color when, each color should represent a unique element, a systematic and coherence presentation."*

**Rule:** Every color carries exactly one meaning across the whole product. If two ideas need to be distinguished, they get different colors — never different shades of the same color.

| Color | Token | Single meaning | Where it appears |
|---|---|---|---|
| **Green** | `--success` `#4ADE80` | **"Event is happening live right now"** | Lifecycle pill `Live` (solid bg, only solid pill) + matching section's "Scanning live" indicator (pulsing dot). Nowhere else. |
| **Accent blue** | `--accent` `#3291FF` | **"Active focus / current activity"** | The one active section's letter medallion + lifecycle pill `Registering` (translucent) + progress-bar fills + recent-activity sub-stats ("+4 in the last 5 min") + accent links. |
| **Amber** | `--warning` `#FCD34D` | **"Draft / not-yet-published"** | Lifecycle pill `Draft` (translucent) + dashboard band heading `○ Draft` + the popped registration code background (amber is its own visual idiom — see RC-B Strong pattern, separate rule). |
| **Red** | `--danger` `#F87171` | **"Error / destructive"** | Form-field error border + error hint text + remove-block / remove-topic hover state. Nowhere else. |
| **Neutral grays** | `--fg-muted` / `--fg-dim` / `--fg-faint` / `--surface-high` | **"Off / done / locked / context"** | Done-state letter medallions + `Closed`/`Locked` chips + lifecycle pills `Upcoming`/`Completed` + all stat-subs that don't carry recent-activity semantic + footer credit + all decorative chrome. |

**Forbidden mixings (these were the bugs in the v1 ED mockup):**
- Green as a "success-metric" highlight on a stat-sub (`100% delivered` in green) — drop the color, use neutral. Green is reserved for live-event state.
- Green as a "done" indicator on the Section A letter medallion or `Closed` chip — drop the color, use neutral gray. "Done" is the absence of color, not a color.
- Blue→green gradient on progress bars — the gradient implied "more = success," which collided with green's reserved meaning. Use solid accent blue.
- Section A getting any color when the active section is B — only ONE section on the page can wear the accent blue medallion at any time.

**Section-state visual ladder (monochrome, no green ever):**
```
Done    →  letter medallion: surface-high bg + fg-muted text
Active  →  letter medallion: accent bg + white text (the one moment of color on the cards)
Locked  →  letter medallion: surface bg + fg-faint text + 0.5 opacity body
```

Chips on the right of section heads also follow monochrome (`Closed` → neutral gray, `Locked` → dimmer neutral). The exception: when the event is *Live*, the active section gets the green pulsing "Scanning live" indicator — that's the green moment migrating from the lifecycle pill to the section it's animating.

**Why this works:** the reviewer can scan the page and read color as a first-class signal: "where's the green?" → that's what's happening right now. "Where's the blue?" → that's where my attention is owed. Everything else is context. Green and blue should be the *only* hues on the page in any given moment; the rest of the design is neutrals + token typography.

**Applies to:** every surface. Sweep PE / PR / EM / CI / LG / DB on next iteration pass and confirm no mixing slipped in.

### 11. Survey — all multiple-choice, no open-ended questions
**User direction (2026-06-10, Page 10 review):** *"no open end questions, all MCs please."*

The survey contains zero free-text inputs. Q2 ("Which speaker or session provided the most clinical utility?") becomes single-select whose **options are the event's schedule blocks/topics** (from the program the organiser entered in EE Step 4), plus a "General sessions / overall" fallback for events without a schedule.

**⚠ Code impact (not just mockup):** the shipped Q15 template has Q2 as free text — `lib/surveyTemplate.ts` (`KEY_HIGHLIGHTS_MAX`), `app/(public)/survey/schema.ts`, `SurveyForm.tsx`, the `survey_responses.key_highlights` column, and ED Section C's "Latest highlight" display all assume text. Converting Q2 to MC is a schema + template + analytics change — schedule it as its own task during production implementation, NOT a silent drive-by.

**Why all-MC:** zero typing on a phone = higher completion; categorical answers aggregate cleanly in AN (consistent with Q16's "categorical distributions, no averages" decision); no PII risk in free text.

**Addendum (2026-06-10):** *"make sure all Qs have 4 options."* Every **fixed-template** question has exactly **4 options** (Q1, Q3, Q4, Q5). Q3 (value proposition) had 3 in the shipped template — a 4th, *"Event format and organisation"*, was added in the mockup. ⚠ Code impact: `VALUE_PROPOSITION_VALUES`/`_OPTIONS` in `lib/surveyTemplate.ts` + the matching Zod enum + any DB CHECK constraint need the 4th slug (e.g. `event_format`) during production implementation.

**Exception — Q2 (speaker/session):** its options are generated from the event's schedule, so the count is `number of sessions + 1` (the "General sessions / overall" fallback) — could be 2 options or 9. The 4-option rule does not apply. Layout consequence: Q2 uses the full-width `chip-stack` (handles any count + long session·speaker labels), while the fixed questions use the 2×2 `chip-grid` with no orphan handling needed.

### 12. Survey intro — single line, "less than 3 minutes" promise
**User direction (2026-06-10, Page 10 review):** *"SV-3. keep it in one line and it should take no longer than 3 mins."*

The intro is ONE line (not a 3-sentence stack): greeting + question count + time promise ≤ 3 minutes. **Locked copy (user-provided, 2026-06-10):** *"Thank you for attending, {first_name}—please complete five quick questions (under 3 minutes)."* Em-dash without surrounding spaces; count spelled out ("five"); time in parentheses. The sentence-stack pattern stays for other surfaces (PR-4, EM-7, CI-7); SV deliberately deviates because survey friction is the enemy.

### 9. Status pills/indicators — always top-left of their container
**User direction (2026-06-08, Page 9 review):** *"keep all the status bar/pills at the same place if top left then all pages should be top left."*

Any status signal (lifecycle pill, "Scanning live" indicator, state chips) anchors to the **top-left** of whatever container it describes:
- Page-level lifecycle pill → top-left of the header, leading the title row.
- Card-level live indicator → top-left of the card, first element in its head row.
- Never top-right, never as a trailing column inside a stats grid.

**Why:** users scan F-pattern (top-left first). A status that moves around page-to-page must be re-found every time; a status that's always the first thing in the container is read for free.

**Sweep needed:** ED Section B currently shows "Scanning live" top-RIGHT of the section head — move to top-left (after the letter medallion, or replacing the chip slot) during the consistency pass. Section chips (`Closed` / `Locked`) follow the same rule when swept.

### 10. TC scoreboard timer — countdown to START, not end
**User direction (2026-06-08, Page 9 review):** *"count down to event start time"* + *"count down to start not to end."*

The TC scoreboard's timer stat counts down to the event's **start time**. Rationale: check-in activity happens in the window before the event begins (reminder email with QR lands 60 min before start) — the reception staff's deadline is the start, not the end. After start, the stat flips to elapsed time ("Started 14m ago").

### 8. Staff NAV — single 3-part bar (back link + identity + sign out)
**User direction (2026-06-08, Page 8 review):** *"the back to event button should be in the same row as user email and sign out. all that is nav."*

The NAV row is the ONE place where cross-page chrome lives on staff surfaces. It contains everything the user needs to traverse out of the current page or end the session — no other element on the page is allowed to take on these duties.

**Composition (left → right):**
```
← Back to [parent]              jane@company.com · Sign out
```

- **Left slot:** parent-link back affordance (only present on pages with a parent). Arrow + label, in `--fg-muted`, hover `--fg`. On the root staff page (DB) the left slot is empty.
- **Right slot:** `email` (in `--fg-muted`) + dot separator (in `--fg-faint`) + `Sign out` (in `--accent`).
- **Layout:** flex row with `justify-content: space-between`. When the left slot is empty, the right cluster stays right-aligned because of `space-between` semantics.
- **Typography:** Inter 13px throughout — same as the locked-in chrome elsewhere.
- **Not a sticky bar.** It scrolls with the page. It sits at the top of the `<main class="container">`, above the page header.

**Why one bar:**
- Earlier mockups had the back link as a separate row above the page title. Two rows of nav-chrome is one too many — the back link is, by definition, navigation, so it belongs in the nav row.
- Folding it in reclaims one `--gap` rhythm beat per page.
- Every staff surface now has the exact same nav shape; a user who learns where to find "Sign out" on the dashboard finds it in the same place on every page.

**CSS:**
```css
.staff-nav {
  display: flex;
  justify-content: space-between;   /* was flex-end — now holds left + right slots */
  align-items: center;
  gap: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--fg-muted);
}
.staff-nav-back {
  color: var(--fg-muted);
  text-decoration: none;
}
.staff-nav-back:hover { color: var(--fg); }
.staff-nav-right { display: flex; align-items: center; gap: 12px; }
```

**Applies to:** DB (empty left slot) · EE (`← Back to events`) · ED (`← Back to events`) · TC (`← Back to event`) · AN (`← Back to event`).

**Out of scope:** attendee-facing surfaces (PE, PR, EM, CI, SV) don't have a NAV row at all — they have the "By Eventar" footer instead.

### 7. EE form — "Event type" terminology (not "Kind")
**User direction (2026-06-08, Page 7 review):** *"EE-S1: 'kind' should be event type."*

In the database we keep the column name `kind` (it's a Postgres enum — see `app/events/new/schema.ts` `KINDS`). In the UI, the user-facing label is **"Event type"** everywhere it appears:
- EE form schedule-block field label
- ED (event details) display
- AN (analytics) breakdown labels if any

**Why two names:**
- `kind` is a database/code-level convention (matches Postgres' `kind` style for discriminated unions; renaming the column would be a migration with no user benefit).
- "Event type" is the user-facing term — clearer to a non-developer staff user who's setting up a workshop. "Kind" reads as developer jargon.

**Applies to:** Every user-visible label that refers to the `kind` enum. Code variable names, zod field names, and DB column names stay as `kind`.

---

## Locked colors and styles

### Popped registration code (RC-B Strong)
**User comment (2026-06-05):** *"for confirmation code, I want the style in B, more popped and visually stimulating"*

**Light mode:**
```css
.regcode {
  background: #FFFBEB;       /* amber-50 */
  border: 1px solid #FED7AA; /* orange-200 */
  padding: 32px 24px;
  border-radius: 14px;
  text-align: center;
  box-shadow: 0 1px 0 #FDE68A;
}
.regcode-label {
  color: #92400E;  /* orange-700 */
  /* + uppercase, 0.12em letter-spacing, font-weight 600 */
}
.regcode-value {
  font-family: 'Geist Mono', monospace;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #7C2D12;  /* orange-900 */
}
```

**Dark mode (inverted polarity):**
```css
.regcode {
  background: #1F1A14;       /* warm-black */
  border: 1px solid #92400E; /* orange-800 */
  box-shadow: 0 0 0 1px rgba(252,211,77,0.1), 0 2px 8px rgba(252,211,77,0.08);
}
.regcode-label { color: #FBBF24; }  /* amber-400 */
.regcode-value { color: #FCD34D; }  /* amber-300, golden */
```

**Applies to:** PR-5, EM-5, CI-5 (the three attendee-facing "this is your code" moments)

### Status pills — translucent in dark mode
**Pattern lifted from earlier color decisions:**

| State | Light bg | Light fg | Dark bg | Dark fg |
|---|---|---|---|---|
| Live | `#D1FADF` | `#054F31` | `rgba(34,197,94,0.15)` | `#4ADE80` |
| Success | `#DCFCE7` | `#14532D` | `rgba(34,197,94,0.15)` | `#4ADE80` |
| Draft | `#FEF7CD` | `#713F12` | `rgba(251,191,36,0.15)` | `#FCD34D` |
| Done | `#F5F5F5` | `#525252` | `rgba(255,255,255,0.08)` | `#A1A1AA` |

Dark mode uses translucent backgrounds (rgba with 0.15 alpha) instead of saturated fills — glassmorphic feel, less harsh against pure black.

---

## Font choice — locked

**User comment (2026-06-05):** *"we'll go with Geist"* (after exploring Plus Jakarta Sans, IBM Plex Sans, Onest, Hanken Grotesk, Manrope, Mona Sans)

- **Geist** for everything (body, headlines, labels)
- **Geist Mono** for code (registration code, technical strings)
- Loaded via `next/font/google` for self-hosting + privacy + zero runtime CDN

## Color palette — locked

**User comment (2026-06-05):** *"C still better"* (Vercel canonical, after exploring X Tune / Y Modernize / Linear-style / GitHub-style / Pure monochrome / Warm minimal)

- **Vercel canonical:** pure black bg, white anchor, `#0070F3` accent (`#3291FF` in dark)
- No indigo brand color preserved from M3 system

---

## Mistakes to avoid (the iteration log)

### M1: Double-spacing via gap + line-height
**Symptom:** PR-4 sentences looked too far apart at `gap: 8px`.
**Cause:** Adding `gap: 8px` on a flex container of `<p>` elements that already have `line-height: 1.6` stacks two spacing systems. Effective visible gap was ~17px when intent was ~8px.
**Fix:** Use one OR the other for text-adjacent stacking. For tightly grouped lines: `gap: 0`, let `line-height` do all the work.
**Rule:** **For adjacent text elements, never mix `gap` and `line-height` leading.** Pick one authority.

### M2: Mixing fonts within a single attribution
**Symptom:** "By Eventar" footer had `BY` in Inter uppercase + `Eventar` in Geist tight letter-spacing.
**Cause:** Trying to make the footer "credits-poster" stylish, mixing fonts to add character.
**Fix:** Uniform font, single weight, single color. Quiet > expressive for footer credits.
**Rule:** **In footer/attribution areas, uniformity reads cleaner than expressive typography.** Save expressive type for hero and accent moments.

### M3: Top-bar branding on attendee pages
**Symptom:** Original mockup had a bordered "Eventar" topbar on every page.
**Cause:** Assumed platform pattern (Notion/Linear style) without checking project-specific brand voice.
**Fix:** Move brand to bottom centered footer. Content-first pattern.
**Rule:** **For attendee-facing surfaces (workshop attendees, not staff), content always > platform branding.** The event is the product, Eventar is the credit.

### M4: Capacity mixed with date/time
**Symptom:** PE-4 included "32 of 60 registered" mashed onto the same line as date/time + venue.
**Cause:** Over-stuffing meta line with three different categories of information.
**Fix:** Two-row format. Row 1 = where. Row 2 = when (with accent). Capacity moves to status pill or its own slot.
**Rule:** **Event meta should be sortable into "where" / "when" / "status" — each gets its own slot, not a single comma-separated line.**

### M5: 80KB single-file mockup
**Symptom:** User couldn't see the comprehensive design audit in their preview panel.
**Cause:** 80KB HTML with 12 surfaces + 95 labeled elements may exceed preview-panel iframe tolerance.
**Fix:** One surface at a time in small (~8KB) files. Same URL, overwrite on advance.
**Rule:** **For iframe-style previews, prefer many small files over one large file.** Per-page focus also improves iteration quality.

### M6: Email design treated as web design
**Symptom:** None yet — flagging proactively before Page 3.
**Risk:** Email clients don't support flexbox `gap`, CSS variables, web fonts, or modern color functions.
**Fix:** Mockup uses modern CSS for preview clarity. Production `emails/confirmation.tsx` falls back to:
- Tables instead of flexbox
- Inline styles only
- `<p style="margin: 0 0 8px">` instead of `gap`
- System font stack instead of Geist
- Hex colors only (no CSS vars)
**Rule:** **Email surfaces are a separate target platform.** Design intent same, implementation primitives different.

---

## Open patterns (not yet locked)

### Staff page navigation — **LOCKED** (moved to Locked patterns, see below)
~~Placeholder removed. Locked as Rule #8 below.~~

### TC QR scanner — delegate to native camera (parked 2026-06-08)
**User direction:** *"get rid of TC-5, when clicked it should just open the camera and scan like any other app. 'switch camera' also."*

**Decision:** No in-app camera viewport on the TC page. The "Scan QR code" affordance is a single button. When tapped:
- **PWA / mobile Safari:** trigger an `<input type="file" accept="image/*" capture="environment">` flow, then decode the captured frame client-side (jsQR or zxing-wasm). This gives the user their native camera UX (including switch-camera, flash, pinch-zoom).
- **Desktop browser (rare for staff):** fall back to `getUserMedia` with a minimal `html5-qrcode` viewport overlaid on the button click. Only this fallback path needs the in-app viewport.

**Why:** building a custom dark-mode viewport with crosshair frame, low-light handling, and switch-camera button duplicates what every native camera already does well. Removing it shrinks the surface area we own AND removes "switch camera" as a bespoke control. Open question: which client-side QR decoder library (jsQR ~10KB vs zxing-wasm ~200KB) — defer until implementation phase.

### Speakers/Host check-in — separate surface, manual toggle (parked 2026-06-08)
**User direction:** *"below those should be the panelist/host checkin status."*

**Decision:** TC page renders a third left-column block listing the event's host + each schedule block's speakers, with a manual check-in toggle per name. Separate from the attendee roster because:
- Speakers/hosts don't register through the public flow — the organiser knows in advance who's delivering.
- They're authored on `event_blocks.host` and `event_blocks.topics[].speaker_name` (plain strings, no relation to `registrations`).
- The organiser cares about "is my speaker here?" at a different urgency than "are attendees here?"

**Open question — data model:** today these are plain strings on `event_blocks`. To track check-in state we need either:
- (A) a new `event_speakers` table with `speaker_name`, `event_id`, `checked_in_at`, plus a denormalised pointer from `event_blocks` — clean but adds a migration.
- (B) a check-in flag synthesised client-side from a `localStorage` map keyed by `event_id + speaker_name` — zero schema change, but state doesn't survive a refresh on a different device.
- (C) "speakers register too" — organiser registers each speaker via the normal flow; their roster row gets a `is_speaker` flag. Reuses the existing pipeline but requires editing the speaker → registration link UX.

Recommendation when this lands: **(A)** for data integrity. Park decision until after Phase-8 deploy.

### ED action toolbar — lifecycle-aware visibility (parked 2026-06-08)
**Status:** Parked during Page 8 review. User direction: *"leave it for now, review later."*

**Question:** Should `Edit` (and possibly `View public`) hide or demote during `live` / `completed` lifecycles? Today's code (`app/events/[id]/details/page.tsx::ActionToolbar`) gates `Roster` / `Analytics` / `View public` by lifecycle but leaves `Edit` unconditional. The Live-state mockup shows all four buttons, which dilutes "Open roster" as the obvious next action.

**Candidate matrix (not adopted):**

| Lifecycle | Primary | Secondary | Tertiary | Hidden |
|---|---|---|---|---|
| Draft | Edit | View public | — | Roster, Analytics |
| Registering | Open roster | Edit · View public | — | Analytics |
| Upcoming | Open roster | View public | Edit | Analytics |
| Live | Open roster | View public | — | Edit, Analytics |
| Completed | Analytics | View public | — | Edit, Roster |

**Trade-off:** hiding Edit during Live/Completed reduces accidental mid-event edits but forces a detour for the rare "fix-a-typo" need. Revisit when the rest of the redesign is locked.

### Mobile-first breakpoints
Current mockup uses `max-width: 480px` for mobile and `max-width: 880px` for tablet (staff surfaces). Need to confirm:
- Where the breakpoint actually triggers
- Whether tablet UI uses different gap rhythm
- Whether mobile should reduce hero title to 24px from 28px

### Dark mode strategy
Decided: **system-default only** (`@media (prefers-color-scheme: dark)` in `globals.css`). No toggle. May add toggle as Phase 9 follow-up if users push back.

---

## How this doc gets updated

After every iteration on the preview mockups, capture:
1. **What the user said** (exact quote where useful)
2. **What changed in CSS/HTML**
3. **What pattern that establishes** (and where it propagates)
4. **What mistake to avoid going forward**

Filed under the right section above. Mistakes go in the iteration log so future implementation knows the reasoning trail.
