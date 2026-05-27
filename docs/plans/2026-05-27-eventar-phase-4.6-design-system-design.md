# Phase 4.6 — Design System Reskin — Design

**Date:** 2026-05-27
**Phase scope:** Apply a Material 3 indigo design system across every existing page. Zero new schema, zero new mutation surfaces, zero new features. Visual + structural overhaul only, leveraging eight HTML mockups the user provided as templates.
**Estimate:** ~1 day. High file count, low per-file complexity. Most risk is in component-primitive retheming touching many call sites.

> [!info] Brainstorm-driven decisions
> Three forks locked via Q&A before any code:
> - **Component strategy:** retheme shadcn-ui via CSS variables only — keep `components/ui/{button,input,card,…}` APIs and call sites untouched. Lowest blast radius; existing forms inherit the new look for free.
> - **Page scope:** all 6 existing pages with matching mockups — `/dashboard`, `/events/new`, `/events/[id]/edit`, `/events/[id]/checkin`, `/events/[id]` (public register), `/checkin/confirm`. `/login` excluded (no mockup; out of scope this phase).
> - **Gap features:** punch-list only. Features the mockups *show* that the app doesn't *have* (Settings page, AI assistant, system alerts, countdown timer, per-event progress bars, Wi-Fi/venue cards) are enumerated as Phase 5+ candidates. Not built in 4.6.

---

## What this phase delivers

1. **Design tokens** in `app/globals.css` — replace the neutral oklch palette with the Material 3 indigo system from the mockups (`primary: #142175`, surface containers, on-surface-variant, etc.). Custom radius scale, custom spacing scale (`xs/sm/md/lg/xl/xxl` = 4/8/16/24/32/48px).
2. **Typography** wired via `next/font` — Source Serif 4 (display/headlines) + Inter (body/labels) replace the default Geist. Material Symbols Outlined loaded once.
3. **shadcn-ui CSS-var retheme** — existing primitives now consume the new tokens. No component API changes; no call-site changes.
4. **`components/shell/`** — `<StaffShell>` (sidenav + topnav-mobile + footer), `<PublicShell>` (minimal header + footer). Wrap staff and public routes respectively.
5. **Six page reskins**, each in its own commit. Layout structure copied from the matching mockup HTML; data bindings preserved from the current page.
6. **Gap punch list** — enumerated at the bottom of this doc and again in the phase-close handoff.

That's the phase. Zero schema. Zero new Server Actions. Zero new mutations.

---

## A. Design tokens

Source: every mockup ships the same `tailwind.config` block. Reconciled into a single set of CSS custom properties in `app/globals.css`. Since the repo uses Tailwind v4 (`@import "tailwindcss"` + `@theme inline`), tokens go in `:root` and are referenced via the `@theme` block — no separate `tailwind.config.ts`.

### Color palette (Material 3 indigo)

From the mockups' shared `colors` map (verbatim):

```css
--color-primary: #142175;
--color-on-primary: #ffffff;
--color-primary-container: #2e3a8c;
--color-on-primary-container: #9ea9ff;
--color-primary-fixed: #dfe0ff;
--color-primary-fixed-dim: #bcc3ff;
--color-on-primary-fixed: #000d60;
--color-on-primary-fixed-variant: #333f91;

--color-secondary: #565e74;
--color-secondary-container: #dae2fd;
--color-on-secondary-container: #5c647a;
--color-secondary-fixed: #dae2fd;
--color-secondary-fixed-dim: #bec6e0;

--color-tertiary: #4b2000;
--color-tertiary-container: #6d3200;
--color-on-tertiary-container: #f09b63;
--color-tertiary-fixed: #ffdbc7;
--color-tertiary-fixed-dim: #ffb689;

--color-surface: #fbf8ff;
--color-surface-bright: #fbf8ff;
--color-surface-dim: #dbd9e1;
--color-surface-container-lowest: #ffffff;
--color-surface-container-low: #f5f2fa;
--color-surface-container: #efedf4;
--color-surface-container-high: #e9e7ef;
--color-surface-container-highest: #e4e1e9;

--color-background: #fbf8ff;
--color-on-background: #1b1b21;
--color-on-surface: #1b1b21;
--color-on-surface-variant: #454651;

--color-outline: #767682;
--color-outline-variant: #c6c5d3;

--color-error: #ba1a1a;
--color-error-container: #ffdad6;
--color-on-error-container: #93000a;
```

### Radii

```css
--radius-default: 0.25rem;
--radius-lg: 0.5rem;
--radius-xl: 0.75rem;
--radius-full: 9999px;
/* Plus a special 20px for the large cards used across mockups */
```

The mockups use `rounded-[20px]` ad-hoc for the headline cards (dashboard metric cards, attendee list panel, registration QR card). Stay literal — keep `[20px]` in JSX rather than inventing a new token.

### Spacing scale

Mockups define a custom scale: `xs/sm/md/lg/xl/xxl = 4/8/16/24/32/48`, plus `grid-margin: 24px` and `grid-gutter: 16px`. Tailwind v4 supports custom spacing via `@theme`. Add them; existing classes (`p-4`, `gap-2`, etc.) keep working since Tailwind preserves the default scale alongside.

### shadcn variable retargeting

Existing shadcn vars in `globals.css` (`--primary`, `--background`, `--card`, etc.) get retargeted to point at the new Material 3 tokens. Mapping:

| shadcn var | → | Material 3 token |
|---|---|---|
| `--background` | | `--color-background` (`#fbf8ff`) |
| `--foreground` | | `--color-on-background` (`#1b1b21`) |
| `--card` | | `--color-surface-container-lowest` (`#ffffff`) |
| `--card-foreground` | | `--color-on-surface` |
| `--primary` | | `--color-primary` (`#142175`) |
| `--primary-foreground` | | `--color-on-primary` |
| `--secondary` | | `--color-secondary-container` |
| `--secondary-foreground` | | `--color-on-secondary-container` |
| `--muted` | | `--color-surface-container-low` |
| `--muted-foreground` | | `--color-on-surface-variant` |
| `--accent` | | `--color-secondary-container` |
| `--accent-foreground` | | `--color-on-secondary-container` |
| `--destructive` | | `--color-error` |
| `--border` | | `--color-outline-variant` |
| `--input` | | `--color-outline-variant` |
| `--ring` | | `--color-primary` |

`--radius` stays at `0.625rem` (close enough to `lg: 0.5rem`). Sidebar vars (`--sidebar-*`) get a parallel set; we'll need them for `<StaffShell>`.

Dark mode is **deferred to a later phase** — the mockups don't define dark tokens for the new system, and the existing dark mode is shadcn defaults which would clash with indigo light. Strip `dark:*` classes from copied mockup snippets during the reskin; revisit dark in Phase 7+.

---

## B. Typography & icons

### Fonts via `next/font/google`

In `app/layout.tsx`:

```tsx
import { Inter, Source_Serif_4 } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-inter' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-source-serif' });
```

Wire to the body class: `${inter.variable} ${sourceSerif.variable}`.

CSS:
```css
--font-sans: var(--font-inter), system-ui, sans-serif;
--font-heading: var(--font-source-serif), Georgia, serif;
```

Remove the existing Geist Mono / Geist Sans imports — Phase 1 scaffold artifacts unused by any mockup.

### Type scale (from mockups)

```css
/* All mockups share these exact sizes/weights — copy verbatim */
.font-display      { font-family: var(--font-heading); font-size: 48px; line-height: 1.2; letter-spacing: -0.02em; font-weight: 700; }
.font-headline-lg  { font-family: var(--font-heading); font-size: 39px; line-height: 1.25; font-weight: 700; }
.font-headline-md  { font-family: var(--font-heading); font-size: 31px; line-height: 1.3; font-weight: 600; }
.font-headline-sm  { font-family: var(--font-heading); font-size: 25px; line-height: 1.3; font-weight: 600; }
.font-title-lg     { font-family: var(--font-sans); font-size: 20px; line-height: 1.5; font-weight: 600; }
.font-body-lg      { font-family: var(--font-sans); font-size: 16px; line-height: 1.6; font-weight: 400; }
.font-body-md      { font-family: var(--font-sans); font-size: 14px; line-height: 1.6; font-weight: 400; }
.font-label-md     { font-family: var(--font-sans); font-size: 12px; line-height: 1; letter-spacing: 0.05em; font-weight: 600; }
```

Defined in `globals.css` as utility classes (since Tailwind v4's `@utility` directive doesn't accept multi-property variants here). Alternative: use `@theme` to register them as `font-{name}` and `text-{name}` pairs.

### Material Symbols Outlined

Mockups use Google Fonts CSS for icons. Add to `app/layout.tsx` `<head>`:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
```

Component: optional `<Icon name="dashboard" filled />` wrapper around `<span class="material-symbols-outlined">{name}</span>` to keep usage tidy. The mockups inline the span directly; copying that pattern is fine for a one-off.

---

## C. Shared shells

### `<StaffShell>` — `components/shell/StaffShell.tsx`

Lifts from the Dashboard / Attendee List / New Event mockups verbatim. Structure:

- Fixed left sidenav (264px wide, hidden < md): logo, user avatar + role label, "New Event" CTA, six nav links (Dashboard, Attendees, Sessions, Analytics, Registration, Settings) with active-state highlighting, footer links (Support, Sign Out).
- Mobile top bar (visible < md): logo + hamburger.
- Main content area: `flex-1 md:ml-64 p-grid-margin max-w-[1440px] mx-auto`.
- Footer.

**Adaptations from mockup → live app:**

- Replace `local_hospital` icon with a neutral `event` or `calendar_month` (Eventar is event management, not medical — the medical theming in mockups was illustrative).
- Drop the medical-staff avatar; use a generic avatar from the staff's email (Gravatar or initials). Initials are cheaper, no external dep.
- Active nav state via `usePathname()`: match `/dashboard` → Dashboard active; `/events/*` → Sessions or Registration depending on subroute (decide once during impl, document the mapping in JSDoc).
- Nav links the app doesn't have yet (Attendees, Sessions standalone, Analytics, Settings) — link to `#` and add a `aria-disabled="true"` + `title="Coming in Phase 5+"`. Don't omit them — they're load-bearing in the mockup's visual rhythm. Punch list will track them.
- "New Event" CTA → existing `/events/new` route.
- "Sign Out" → existing `SignOutButton` Server Action.

### `<PublicShell>` — `components/shell/PublicShell.tsx`

Lifts from the Registration / Check-in Confirmation mockups. Structure:

- Header: logo + tagline (no nav, no avatar — public/anon flow).
- Main: `flex-1 w-full max-w-7xl mx-auto`.
- Footer: privacy / terms / support links.

Used by: `/events/[id]` (public register), `/checkin/confirm`.

The attendee registration mockup specifically suggests an asymmetric branding split (left 1/3 brand + dates, right 2/3 form). That's a *page-level* layout choice, not a shell choice — `<PublicShell>` stays minimal; the page does the split.

---

## D. Page reskin map

Each page gets one commit. Order is dependency-first (shells before pages that consume them) and risk-first (low-traffic first to validate, high-traffic last after the system is proven).

### D.1 — Tokens + fonts + shadcn retheme (foundation)

One commit. Changes:

- `app/globals.css` — full token rewrite per §A above. shadcn vars retargeted per the table.
- `app/layout.tsx` — `next/font` wiring, Material Symbols link tag, body class includes font variables.
- Drop unused Geist imports.

Verification: every existing page renders without layout shift. Buttons, inputs, cards take the new colors automatically via shadcn var retargeting. Zero per-page changes yet.

### D.2 — `<StaffShell>` + `<PublicShell>`

One commit. New files in `components/shell/`. Not yet wired into any page (next commits do that).

### D.3 — `/dashboard` → Staff Dashboard mockup

Current: [app/dashboard/page.tsx](app/dashboard/page.tsx) — 70 lines, plain `<ul>` of events with title + start_time + status.

Mockup: hero metrics (Total Registered, Current Check-ins with progress bar, Active Sessions), Upcoming Sessions list (8 cols), Quick Actions + Alerts panel (4 cols).

**Lifted from mockup:** the asymmetric 8/4 grid, the metric card structure (`rounded-[20px] p-lg border border-outline-variant`), the session-item layout (24-col date column + title/description/pills).

**Adapted:** drop the "active sessions" metric (single-event PRD, not multi-session). Drop the "system alert" panel (no feature backing it — punch list). Replace metric numbers with real queries from the dashboard's existing `events` fetch + a count over `registrations`. "Upcoming Sessions" → upcoming events list (single-event-per-row), preserving existing edit-link behavior.

Result: dashboard becomes one hero block (newest event metrics) + events list. Lose nothing functional; gain brand identity.

### D.4 — `/events/[id]/checkin` → Attendee List mockup

Current: [app/events/[id]/checkin/page.tsx](app/events/[id]/checkin/page.tsx) wraps `<RosterClient>` (the Realtime + scanner component).

Mockup: dense table with avatar circles + name/specialty/ticket/status pills, asymmetric right column with countdown / scan-badge anchor / quick stats.

**Lifted:** the table structure (`text-on-surface-variant font-label-md uppercase tracking-wider` headers, divide-y, hover state, status pill classes), the QR-scan anchor card (large primary-container icon, gradient overlay, group-hover scale), the quick-stats 2-col grid.

**Adapted:** drop "Specialty" column — not in registrations schema. Replace ticket ID with `registration_code`. Replace pending/checked-in pills with `registered`/`attended` from existing schema. Right-column countdown reads `event.start_time`. Keep `RosterClient`'s Realtime + scanner + manual-entry logic intact — only swap markup.

This is the highest-risk page in 4.6 because RosterClient is the most complex client component. The reskin must NOT touch `handleMark`, `handleScan`, or the Realtime subscription. Mechanical class-string swap only.

### D.5 — `/events/new` → New Event Setup mockup

Current: [app/events/new/page.tsx](app/events/new/page.tsx) — 198 lines, form with title, datetimes, venue search, capacity.

Mockup: two-column layout (left 8: rounded card sections for Basic Info, Description with toolbar, Registration Controls toggle; right 4: sticky status card with completion %, live preview card, AI assistance card).

**Lifted:** the section-card pattern (`rounded-[20px] p-xl border border-outline-variant shadow-sm`) with icon circle + headline pair, the floating-label underline input style, the sticky right-column.

**Adapted:** drop the rich-text toolbar (no rich-text in current event schema — description is plain text or empty). Drop AI assistance card (punch list). Drop "Registration Controls" public toggle (status transitions are draft → published, handled by publish button on edit page). Keep `VenueSearchBox`, the Zod-validated form, the `createEvent` Server Action.

Status completion card on the right shows: "Title set ✓", "Dates set ✓", "Venue set ✓" — derived from form state. Live preview card shows the same data the form is collecting (mirrors the mockup's "preview" affordance with real values).

### D.6 — `/events/[id]/edit` → derives from New Event mockup + dashboard hero

Current: [app/events/[id]/edit/page.tsx](app/events/[id]/edit/page.tsx) — 184 lines, same form shape as `/new` plus publish button, QR download, CSV export, check-in link.

No dedicated mockup, but the structure mirrors New Event with status pill flipped (`Published` vs `Draft`). Lift the same section-card pattern from D.5. Right-column sticky panel becomes: status card → QR + Download → Open Check-in → Export CSV → Delete (existing actions, restyled).

### D.7 — `/events/[id]` → Attendee Registration mockup

Current: [app/(public)/events/[id]/page.tsx](app/(public)/events/[id]/page.tsx) — 135 lines, event details + `<RegisterCard>` form.

Mockup: 4/8 asymmetric split — left brand panel (primary background, atmospheric image, date + location blocks), right form panel (full name, ID, specialization, email, submit).

**Lifted:** the brand-panel structure, the input pattern with leading icon + bordered rounded-lg + focus ring.

**Adapted:** drop "Medical License" and "Specialization" fields (not in registrations schema; would need new columns — out of scope this phase, punch list). Keep existing fields: full_name, email. Brand panel shows event title, start_time → end_time, venue (real event data, not "HKMS Symposium" placeholder).

### D.8 — `/checkin/confirm` → Check-in Confirmation desktop mockup + Mobile Confirmation mockup

Current: [app/(public)/checkin/confirm/page.tsx](app/(public)/checkin/confirm/page.tsx) — three states (no code, unrecognised, already-attended page-render) + the active "I'm here" path which uses `<ConfirmButton>`.

Mockup desktop: 8/4 split — left "Registration Confirmed" status + Next Up + Wi-Fi cards, right QR + attendee details + registration ID card (sticky).
Mockup mobile: stacked variant — success header → QR card → Next Up bento → featured speaker → CTA.

**Lifted:** the success-icon + status-pill header, the QR-anchor card, the bento "Next Up" block, the divided action buttons in the QR card.

**Adapted:** drop Wi-Fi card (no infra for it — punch list). Drop "Featured speaker" / "Workshop Spotlight" (no schema for sessions — punch list). Drop "Download Badge" + "Venue Map" buttons (no badge generation, no map — punch list). Keep: registration QR (already generated by `lib/qr.ts`), attendee name, event title, "Next Up" → the event start time.

The four states (no-code, unrecognised, registered + "I'm here", attended) all live in this page. Each gets a mockup-aligned variant but reuses `<ConfirmButton>` for the active path.

---

## E. Out of scope — punch list (Phase 5+ candidates)

Discovered while mapping mockups to current code. Logged here so they're not lost; not built in 4.6.

| Feature | Visible in mockup | Schema impact | Suggested phase |
|---|---|---|---|
| Settings page (org name, logo upload) | Settings mockup | New table `org_settings` | Post-Phase-6 (commercialisation fork) |
| AI event-description assistant | New Event mockup | None (LLM call) | Optional Phase 5+ |
| System alerts panel (high-traffic checkin desk warning) | Dashboard mockup | None (derived from realtime checkin rate) | Phase 6 (analytics) |
| Countdown timer on staff pages | Attendee List mockup | None (pure client) | Easy win, defer to Phase 5 |
| Per-event progress bar on dashboard | Dashboard mockup metric card | None (read-side only) | Easy win, defer to Phase 5 |
| Wi-Fi / Venue Map cards on confirm | Confirm mockup | New `event.wifi_*`, `event.venue_map_url` cols | Phase 5+ |
| Badge download (PDF/PNG with attendee photo) | Confirm mockup | None (server-side render) | Phase 5+ |
| Specialization / Medical-ID fields | Registration mockup | New `registrations.specialization`, etc. | Commercialisation fork only |
| Multi-session events (Sessions nav, panel speaker lists) | Multiple mockups | New `sessions` table | Major scope — likely post-MVP |
| Notifications icon + unread badge | Mobile mockup top bar | New `staff_notifications` table | Phase 6+ |

---

## F. Test plan

Existing test suite (95/95 vitest) covers logic, not visual. Reskin shouldn't change vitest count — but **all** existing tests must still pass after each commit (especially after D.1 since CSS-var retargeting can break visual regressions in test-rendered snapshots if any exist).

Static gates after each commit:
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint .`
- `pnpm exec vitest run`
- `pnpm exec next build`

Expected end-of-phase numbers: **95/95 vitest** (unchanged), **11 routes** (unchanged), `tsc`/`eslint` clean.

---

## G. Backtest plan (mutation-surface regression sweep)

Reskin touches markup, not actions. But because it touches the markup *around* every form and button, regressions are possible (wrong field names, wrong type="submit", wrong action prop). Backtest each mutation surface end-to-end after the phase:

1. **Register through `/events/[id]` (anon)** → row in `registrations` with valid `registration_code`. Same flow as Phase 2 backtest.
2. **Mark attended on `/events/[id]/checkin` (staff)** → row updated, Realtime broadcast received. Same flow as Phase 4 backtest §A1.
3. **Self check-in on `/checkin/confirm` (anon)** → row updated. Same flow as Phase 4 backtest §A2.
4. **Export CSV from `/events/[id]/edit` (staff)** → download succeeds when registration is closed. Same flow as Phase 4 backtest §A3.
5. **Create + publish event from `/events/new` and `/events/[id]/edit` (staff)** → rows in `events` with status transitions. Phase 1/3 paths.

The seed pattern from Phase 4's addendum still works: pick a published event, push start_time forward, seed registrations via SQL with valid alphabet codes.

---

## H. Phase-completion protocol (per user-global CLAUDE.md)

Phase 4.6 closes only after all three legs pass:

1. **Dev-perspective review** — agent reads the diff + every reskinned page in full. Looks for: stale class strings, missing imports, accidental shadcn-component API breaks, hydration warnings, accessibility regressions (color contrast on the new palette, focus-visible rings on retargeted shadcn vars).
2. **User-perspective review** — separate agent does cold-start journeys: login → dashboard → new event → publish → register as anon → check in via QR scan → self-check-in via personal link. Reads every error message in context. Notes any "I succeeded but did I do the right thing?" ambiguity introduced by the new visuals.
3. **Backtest** — §G above against the real DB.

Then the phase-close handoff (`docs/plans/handoff_DDMMYYYY.md` or addendum) gets written.

---

## I. Commit sequence

| # | Commit | Files touched | Risk |
|---|---|---|---|
| 1 | `feat(design): material 3 tokens + fonts (phase 4.6 foundation)` | `app/globals.css`, `app/layout.tsx` | Low — pure CSS/font change |
| 2 | `feat(shell): StaffShell + PublicShell components` | `components/shell/*` (new) | Low — additive, not yet wired |
| 3 | `feat(dashboard): reskin dashboard with metric hero + sessions list` | `app/dashboard/page.tsx`, `app/dashboard/SignOutButton.tsx` | Low — page already minimal |
| 4 | `feat(checkin): reskin /events/[id]/checkin attendee list + scan anchor` | `app/events/[id]/checkin/page.tsx`, `RosterClient.tsx` | **Medium — RosterClient logic must not regress** |
| 5 | `feat(new-event): reskin /events/new with two-col layout` | `app/events/new/page.tsx`, `components/event-form/*` | Medium — form is dense |
| 6 | `feat(edit-event): reskin /events/[id]/edit with sticky actions panel` | `app/events/[id]/edit/page.tsx` | Medium |
| 7 | `feat(public-register): reskin /events/[id] with brand-panel split` | `app/(public)/events/[id]/page.tsx`, `components/RegisterCard.tsx` | Low — single form |
| 8 | `feat(public-confirm): reskin /checkin/confirm with QR anchor + bento` | `app/(public)/checkin/confirm/page.tsx`, `ConfirmButton.tsx` | Low — mostly static |
| 9 | `docs(phase-4.6): close + handoff` | `docs/plans/handoff_27052026.md` (addendum) or new `handoff_28052026.md` | None |

Nine commits, single branch. Static gates run after every commit; backtest runs at the end before commit 9.

---

## J. What I will NOT do in this phase

- Build the Settings page or any feature on the punch list.
- Touch the Phase-8 deploy gates (PII oracle, CSPRNG, host-header, migration drift) — those have their own remediation work; not smuggled into a reskin.
- Add dark mode tokens (mockups don't define them; revisit Phase 7+).
- Rewrite `RosterClient`'s Realtime / scanner / debounce logic — pure markup swap only.
- Add new routes. Phase 4.6 = same 11 routes, restyled.
- Add new dependencies (Material Symbols loads via CSS link; `next/font` already present).
- Touch the vault. Vault still describes the existing visual language as "minimal / utilitarian." Add a vault note in Phase 5 once 4.6 lands, summarizing the design system shift.
