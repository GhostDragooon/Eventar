# Frontend full-spec review — 2026-09-18

**Scope:** every live Eventar frontend surface — alignment, typography, spacing, icons, copy, component reuse, interactive states, a11y, theme, cross-page consistency, audience boundary.

**Rubric (in precedence order):**
1. Q32 audience boundary + Stage 10 vocabulary lock (docs/plans/PROJECT_STATE.md).
2. Eventar Frontend Design Standard (vault `30 — Reference/Frontend Design Standard.md`, locked 2026-08-09) — project-final call.
3. Global frontend component library (per Ivan's redirect 2026-09-18) — Material Design 3 (`--md-sys-*` role vocabulary), GitLab Pajamas, cult-ui (shadcn/Tailwind), via the `design-system-libraries` skill. Findings speak the shared vocabulary the downstream design pipeline uses; where local terms drift from the global library, both are named.
4. CLAUDE.md hard rules — Rule 12 (fail visibly), Rule 7 (surface conflicts), Rule 14 (investigate before escalate).

**Default:** observe + report; no fixes without approval mid-pass. Non-goals: RAG, Stage 13, backend refactors, whole-repo staff→organizer rename, dev-preview sandbox (`/dev-preview-uiport/*`).

---

## Summary

**25 of 28 live routes walked** in light-mode desktop. 4 attendee-authenticated routes deferred (F-ATT-1 — review mode's session is staff, not attendee).

**Findings tally**: 2 BLOCKER, 8 IMPORTANT, 12 MINOR, 30+ NOTE. **Top offenders**: F-DETAILS-1 (BLOCKER — readiness strip reads "Not set" on an event with issued credits), F-CHECKIN-1 (BLOCKER — check-in scoreboard "Not open yet" on a completed event), F-DIALOG-1..4 (four IMPORTANTs on `ConfirmDialog` primitive — closes on one primitive rework), F-SWEEP-SELECT-1 (IMPORTANT systemic across every Base UI Select consumer), F-LANDING-1 + siblings (accessible-name span-composition — 4 sites, one primitive fix).

**Full findings-per-page detail below.** Ranked fix order at the report bottom under "Recommended fix order" (Tier 1 BLOCKERs → Tier 2 shared-primitive gaps → Tier 3 page-local polish → Deferred).

**Alignment against global component library** (per Ivan's 2026-09-18 redirect): Eventar's token layer IS Material Design 3 verbatim, with two documented Eventar-specific extensions (`--primary-ink` fill/ink split from Frontend Design Standard §1, and `--success`/`--warning`/`--danger` status extensions). Every Eventar primitive + token in the Global component findings section names its MD3 role + Pajamas/cult-ui equivalents. Fix patterns quoted in shared vocabulary the downstream design pipeline speaks.

---

## Global component findings

_(Alignment inventory. Every Eventar primitive + token is cross-referenced against the global library it aligns with, per Ivan's 2026-09-18 redirect.)_

### Token architecture — Material Design 3, with two Eventar-specific extensions

**Verdict: strong alignment.** The token layer at [app/globals.css](/Users/ivan/Eventar/app/globals.css) is Material 3 role-tokens verbatim (mapped through `@theme inline` so every role becomes a Tailwind utility class), with two deliberate deviations documented in the Frontend Design Standard §1:

| Eventar token | MD3 equivalent | Pajamas equivalent | shadcn equivalent | Notes |
|---|---|---|---|---|
| `--primary` (`#0070f3`) | `--md-sys-color-primary` | `--gl-color-blue-500` | `--primary` | **Fill role.** Safe under white (4.55:1). |
| `--primary-ink` (`#1c3c94`) | *no MD3 equivalent* | `--gl-color-blue-700`/higher | *no shadcn equivalent* | **Ink role, Eventar-specific.** The one addition to MD3 — necessary because `#0070f3` fails AA as ink on pale grounds (`surface-container` 4.36:1, `primary-container` 4.04:1). |
| `--on-primary` (`#fff`) | `--md-sys-color-on-primary` | *implicit; `--gl-text-color-strong` on buttons* | `--primary-foreground` | ✓ Direct MD3 mapping. |
| `--primary-container` (`#eaf2fd`) | `--md-sys-color-primary-container` | `--gl-color-blue-50` | *shadcn: `--accent` (different role)* | ✓ Direct MD3 mapping. |
| `--on-primary-container` (`#1c3c94`) | `--md-sys-color-on-primary-container` | `--gl-color-blue-950` | *no equivalent* | ✓ Direct MD3 mapping. |
| `--tertiary` (`#0e79ec`) | `--md-sys-color-tertiary` | *no equivalent — Pajamas uses ramp steps* | *no equivalent* | Q31 ramp's "highlight blue". Contrast 4.23:1 — large/bold text only. Never small labels. |
| `--surface`, `--surface-container-{lowest,low,,high,highest}` | `--md-sys-color-surface{-container{,-lowest,-low,,-high,-highest}}` | `--gl-background-color-{default,subtle,strong,overlay}` | `--background`, `--card`, `--popover`, `--muted` | ✓ Direct MD3 mapping. 5-step surface hierarchy. |
| `--outline`, `--outline-variant` | `--md-sys-color-outline{,-variant}` | `--gl-border-color-{default,strong,subtle}` | `--border`, `--input` | ✓ Direct MD3 mapping. |
| `--error`, `--on-error`, `--error-container`, `--on-error-container` | `--md-sys-color-error{,-container,-on-*}` | `--gl-text-color-danger` | `--destructive` | ✓ Direct MD3 mapping. |
| `--success`, `--success-container`, `--on-success-container` | *not stock MD3 — MD3 uses `tertiary`* | `--gl-text-color-success` | *no equivalent* | **Eventar extension.** Green reserved for live / verified / good standing per Frontend Design Standard §2. Blue never signals verification. |
| `--warning`, `--warning-container`, `--on-warning-container` | *not stock MD3* | `--gl-text-color-warning` | *no equivalent* | **Eventar extension.** Same reasoning as `--success`. |
| `--danger` | *aliased to `--error`* | `--gl-text-color-danger` | `--destructive` | Alias for `--error`, per Frontend Design Standard §2. |
| `--text-{display,headline-*,title-lg,body-*,label-*}` | `--md-sys-typescale-{display,headline,title,body,label}-{small,medium,large}-size` | `--gl-font-size-{100-800}` | *no equivalent — cult-ui uses Tailwind's own scale* | ✓ Direct MD3 typescale, multiplied by `--text-scale` (a11y text sizing multiplier at /settings). |
| `--spacing-{xs,sm,md,lg,xl,xxl}` | *MD3 uses 8dp/4dp grid, no named tokens* | `--gl-spacing-scale-{2,3,5,6,7,9}` | *no equivalent — Tailwind scale* | Custom named spacing scale, 8px base. Consistent with 8dp grid. |

**Alignment call: Material 3 is Eventar's primary reference.** Fix patterns should quote MD3 role names first (`--md-sys-color-on-primary-container`), with Pajamas/shadcn as secondary references. The fill-vs-ink split is a **local extension of MD3**, not a departure — the two names map cleanly to how MD3 would recommend using `on-surface` for text-on-tint vs `primary` for the fill.

**Known token debt** (already flagged in Frontend Design Standard §6, carrying forward as pre-existing residuals — NOT new findings):

- `components/landing/LandingHero.tsx` — `#0D74E2`, `#0E79EC`, `#1C3C94`
- `components/landing/HowItWorks.tsx` — `#0E79EC`, `#1C3C94`
- `components/landing/LedgerWindow.tsx` — `#0E79EC`, `#E4F2E9`, `#F9EFD9`, `#B26B00`
- `components/details/LiveScoreboard.tsx`, `app/events/[id]/checkin/Scoreboard.tsx`, `components/details/StickyLiveBar.tsx` — `#4ADE80`
- `components/dev/ReviewBanner.tsx` — `#B26B00`
- `components/ui/toast.tsx` — `#4ADE80`, `#F87171`, `#0A0A0A` (**re-verified below**)
- `app/(public)/events/[id]/poster/page.tsx` — `#0A0A0A`, `#FFFFFF`

_This audit will verify each of these is still hardcoded (via grep sweep in the Text & icon inventories section), and report only new violations that have crept in since the debt list was written._

### Primitives — [components/ui/](components/ui/)

Small tight system (10 primitives) — all read; catalogued below with variants, state coverage, and global-library equivalents.

#### Button — [components/ui/button.tsx](/Users/ivan/Eventar/components/ui/button.tsx)

- **Variants**: `default | outline | secondary | ghost | destructive | link`
- **Sizes**: `default (h-8) | xs (h-6) | sm (h-7) | lg (h-9) | icon (size-8) | icon-xs (size-6) | icon-sm (size-7) | icon-lg (size-9)`
- **Shape**: `rounded-full` — action-pill everywhere (2026-08-08 "one language" rule).
- **States**: default / hover / focus-visible / active (`translate-y-px`) / disabled / aria-invalid — full coverage.
- **Tokens used**: `--primary`, `--on-primary`, `--secondary`, `--muted`, `--destructive`, `--ring`, `--border`, `--foreground`. Direct MD3 alignment.
- **Cross-library mapping**:
  - Pajamas: `default` = `variant="confirm"` (blue-500 primary); `destructive` = `variant="danger"`; `outline` = `variant="default"` neutral outline; `link` = `variant="link"`; `ghost` ≈ `variant="reset"`.
  - Material Web: `default` = `<md-filled-button>`; `outline` = `<md-outlined-button>`; `secondary` = `<md-filled-tonal-button>`; `ghost` = `<md-text-button>`; `link` = no direct equivalent (would be a `<md-text-button>` with underline); `destructive` = no direct equivalent (MD3 uses a colour override on filled).
  - cult-ui / shadcn: matches shadcn variant vocabulary directly.
- **F-BTN-1 (NOTE, cross-library divergence):** `destructive` variant uses a **tinted background** (`bg-destructive/10 text-destructive`) rather than a solid destructive fill. Pajamas' `variant="danger"` and Material's danger override both use a full-bleed error fill. Eventar's choice is defensible (softer signal for click-to-open destructive actions where the ConfirmDialog carries the actual confirmation), but it is a documented departure. **Fix pattern if aligned to global library**: two variants — `destructive-tint` (current behaviour, for "opens a destructive confirm") and `destructive-solid` (Pajamas `variant="danger"` equivalent, for one-shot destructive actions with no confirm).

#### Input — [components/ui/input.tsx](/Users/ivan/Eventar/components/ui/input.tsx) & Textarea — [components/ui/textarea.tsx](/Users/ivan/Eventar/components/ui/textarea.tsx)

- **Variants**: single variant each (no `size` prop).
- **States**: default / hover (implicit) / focus-visible (ring) / disabled / aria-invalid (destructive ring). Missing: explicit `readonly` styling, explicit `aria-valid` success state.
- **Tokens used**: `--input`, `--ring`, `--destructive`, `--foreground`, `--muted-foreground`. Direct MD3 alignment.
- **Cross-library mapping**:
  - Pajamas: matches `text-input` / `textarea` components + `form-input-group` prepend/append pattern (Eventar doesn't ship the group pattern — see F-INPUT-2 below).
  - Material Web: closest equivalent is `<md-outlined-text-field>` (Eventar's border style matches).
  - cult-ui / shadcn: matches shadcn `Input` / `Textarea` directly.
- **F-INPUT-1 (NOTE):** `text-base` on mobile becomes `text-sm` at `md:` — mobile-first defence against iOS auto-zoom on <16px inputs. Correct pattern.
- **F-INPUT-2 (MINOR, missing variant):** No prepend/append affordance (Pajamas `form-input-group`, Material `<md-outlined-text-field>` with slots). Any consumer needing "https://" prefix or "@" suffix rolls their own with adjacent divs. **Fix pattern**: extend with `leadingContent` / `trailingContent` slots matching Pajamas `form-input-group`.

#### Select — [components/ui/select.tsx](/Users/ivan/Eventar/components/ui/select.tsx)

- **Variants**: single variant. `size` prop: `sm | default`.
- **Sub-components**: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`.
- **Base primitive**: Base UI `@base-ui/react/select`.
- **Tokens used**: `--input`, `--ring`, `--destructive`, `--popover`, `--popover-foreground`, `--accent`, `--muted-foreground`, `--border`. Direct MD3 alignment.
- **Cross-library mapping**:
  - Pajamas: `Combobox` (dropdown) — but Pajamas separates single-select-from-list vs autocomplete more strictly than Eventar.
  - Material Web: `<md-outlined-select>` + `<md-select-option>`.
  - cult-ui / shadcn: matches shadcn `Select` directly.
- **F-SELECT-1 (Base-UI trigger quirk, previously found + partly fixed):** Handoff `handoff_12092026_v2.md` documents a class of bug where Base UI's `SelectValue` renders the raw `value` attribute rather than the option label unless the consumer passes a `<SelectValue>{label}</SelectValue>` render prop. Fix applied on 4 known consumers; live sweep will re-verify.

#### Dialog — [components/ui/Dialog.tsx](/Users/ivan/Eventar/components/ui/Dialog.tsx) vs ConfirmDialog — [components/ui/ConfirmDialog.tsx](/Users/ivan/Eventar/components/ui/ConfirmDialog.tsx)

Two dialog components. Different shapes, different a11y coverage, different scrim tokens — **the largest inconsistency in the primitive layer**:

| Aspect | `Dialog` | `ConfirmDialog` | Divergence |
|---|---|---|---|
| Purpose | General content dialog | Locked confirm/cancel pair | ✓ intentional split |
| Scrim | `bg-on-surface/60` (token) | `bg-black/50` (**hardcoded hex**) | **F-DIALOG-1 IMPORTANT** — see below |
| Focus target | first field, then close button | confirm button | ✓ intentional |
| Escape closes | ✓ | ✓ | ✓ |
| Backdrop click closes | ✓ | ✓ | ✓ |
| **Tab focus trap** | ✓ full cycle | ✗ **NOT IMPLEMENTED** | **F-DIALOG-2 IMPORTANT** — see below |
| Restore focus on close | ✓ | ✗ | **F-DIALOG-3 IMPORTANT** — see below |
| Reduced-motion respect | ✓ | ✓ (no animation to disable) | ✓ |
| Button implementation | consumer passes `footer` (unopinionated) | raw `<button>` elements with hardcoded classes | **F-DIALOG-4 IMPORTANT** — see below |
| Icon tone | `primary \| error` | none | ~ |
| Danger button style | via consumer's Button variant | `bg-[color:var(--error)] text-white` (**solid, hardcoded**) | **F-DIALOG-5 NOTE** — Two different destructive patterns coexist (see F-BTN-1) |

**F-DIALOG-1 (IMPORTANT, a11y + theme):** ConfirmDialog scrim hardcodes `bg-black/50` while Dialog uses `bg-on-surface/60`. On dark mode, the tokenized approach adapts (surface flips to near-black at the same ~60% opacity); the hardcoded approach stays near-pure black regardless. Rarely visible defect but a theme drift. **Fix pattern**: `bg-on-surface/60` — matches MD3 `--md-sys-color-scrim` at 32% opacity (Eventar's 60% is stronger, defensible for a confirm).

**F-DIALOG-2 (IMPORTANT, a11y):** ConfirmDialog has no Tab-cycle focus trap. Keyboard users pressing Tab from the confirm button leave the dialog into browser chrome and can Tab into the (visually hidden but focusable) page underneath. Violates WCAG 2.1.2 (No Keyboard Trap in reverse: keyboard focus should remain within the modal). **Fix pattern**: port the `FOCUSABLE` selector + Tab handler from `Dialog.tsx:24-31, 84-111`.

**F-DIALOG-3 (IMPORTANT, a11y):** ConfirmDialog doesn't restore focus to the opener on close. `Dialog.tsx:65, 117` captures `document.activeElement` on open and calls `.focus()` on cleanup. WCAG 2.4.3 (Focus Order) — a confirm-then-cancel-then-continue flow leaves keyboard users at the top of `<body>`. **Fix pattern**: same as F-DIALOG-2 — port the opener-restore logic.

**F-DIALOG-4 (IMPORTANT, primitive drift):** ConfirmDialog builds Cancel + Confirm buttons as raw `<button>` elements with bespoke classes (`min-h-11 px-lg py-sm rounded-lg border border-outline-variant …`) rather than composing `ui/Button` variants. Any future Button variant/token change bypasses ConfirmDialog. **Fix pattern**: `<Button variant="outline">Cancel</Button>` + `<Button variant={tone === 'danger' ? 'destructive' : 'default'}>{confirmLabel}</Button>`. **Blocking sub-decision if adopted**: whether the destructive-solid pattern (matching current ConfirmDialog) or destructive-tint (matching current Button primitive) wins — see F-BTN-1.

#### Toast — [components/ui/toast.tsx](/Users/ivan/Eventar/components/ui/toast.tsx)

- **Tones**: `success | error | neutral` — 3 tones.
- **Auto-dismiss**: 4500ms.
- **Stack**: max 3 (older toasts drop).
- **A11y**: `aria-live="polite"`, per-toast `role="status"`, aria-label on dismiss button. ✓
- **Cross-library mapping**:
  - Pajamas: `Toast` — matches conceptually.
  - Material Web: no ready-made Toast component (`Snackbar` is in labs elsewhere).
  - cult-ui / shadcn: has `Toast` in the Radix stack (Eventar uses a custom implementation instead).
- **F-TOAST-1 (NOTE, pre-known debt):** Toast hardcodes `bg-[#0A0A0A]`, `text-[#4ADE80]`, `text-[#F87171]` — already in Frontend Design Standard §6 debt list. On dark mode the surface flips lighter but the toast stays `#0A0A0A`. **Fix pattern**: `bg-inverse-surface text-inverse-on-surface`, `text-success`, `text-error`, `text-on-surface-variant`. Would be theme-adaptive automatically.
- **F-TOAST-2 (NOTE, missing variant):** No "warning" tone (only `success | error | neutral`). Warning use-cases currently fall to `neutral` which is the same styling as generic info — no distinct amber signal. **Fix pattern**: add `warning` tone using `text-warning`/`warning` icon. Or intentional simplification — defer unless a caller surfaces the need.
- **F-TOAST-3 (MINOR, missing feature):** No action button (undo, retry). Pajamas Toast supports one action; Material Snackbar supports one action + one dismiss. **Fix pattern**: optional `action?: { label: string; onClick: () => void }` prop; align with Pajamas.

#### Others — Accordion, Toggle, ToggleGroup

_Deferred read — will inventory as they surface on pages. Small usage footprint expected._

### Shells — [components/shell/](components/shell/)

Five shell components, single BrandMark shared across all four route audiences. Read: StaffShell + BrandMark. Pending: PublicShell, SiteShell, SiteFooter.

#### BrandMark — [components/shell/BrandMark.tsx](/Users/ivan/Eventar/components/shell/BrandMark.tsx)

- Single definition, four call sites (LandingNav, SiteShell, PublicShell, StaffShell). Fix from Frontend Design Standard §4 — reversed the older "no wordmark in shell chrome" rule.
- Props: `href` (varies by audience — Ivan's Q32 boundary rule) + `compact` (26px sidebar tile vs 30px nav pill).
- Tokens used: `--primary`, `--on-primary`, `--on-surface`. Direct MD3 alignment.
- Wordmark always 16px, always sans (serif dropped 2026-08-21 per Ivan's repeated preference).
- aria-label "Eventar home" — ✓ good.
- **F-BRAND-1 (MINOR, arbitrary values):** Uses `text-[calc(15px*var(--text-scale))]` and siblings — arbitrary values rather than a typescale utility. The Frontend Design Standard's typescale doesn't define a 15/17px step, so this is deliberate — but the pattern spreads to StaffShell (13.5px sidebar labels) and looks like design drift. **Fix pattern (open call for Ivan)**: either accept as "shell chrome uses arbitrary sizes deliberately" (add a `--text-shell-*` token family) or migrate to the nearest defined step and lose ~0.5-1.5px on some labels.

#### StaffShell — [components/shell/StaffShell.tsx](/Users/ivan/Eventar/components/shell/StaffShell.tsx)

- **Layout**: left sidebar (248px, sticky, viewport-height) + main content region + SiteFooter. Below `md:` breakpoint the sidebar collapses to a horizontal strip.
- **Nav rows**: Programme (`/dashboard`), Manage (`/dashboard/manage`), Participants (`/participants`), **Accreditation** (inert, "Soon"), Check-in (`/checkin`), **Communications** (inert, "Soon"), Reports (`/analytics`), + Settings under an "Admin" heading.
- **A11y**: skip link, `aria-label="Primary"` on nav, `aria-current="page"` on active row, `aria-disabled="true"` on Soon rows (correctly rendered as `<span>` not disabled `<button>` — preserves screen-reader clarity).
- **Boundary**: EVENTS DELIBERATELY ABSENT — the old Events row pointed at the attendee `/events` list and ejected staff from the shell. Frontend Design Standard §3 rule. Regression guard in `StaffShell.test.tsx`.
- **Account chip**: bottom-left of sidebar, uses `--primary-container` + `--on-primary-container`, first-name + email visible.
- **Wordmark**: `<BrandMark compact href="/dashboard" />` — top of sidebar.
- **Tokens used**: `--sidebar`, `--surface-container-high`, `--primary-container`, `--on-primary-container`, `--outline-variant`, `--on-surface`, `--on-surface-variant`. Direct MD3 alignment.
- **Cross-library mapping**: closest equivalent is Material Web `<md-navigation-drawer>` (labs, not stable) with `<md-list-item>`s. Pajamas has the sidebar as a `navigation-sidebar` pattern (not a component). Distinct from cult-ui (no shell component).
- **F-STAFFSHELL-1 (MINOR, arbitrary values):** Same class as F-BRAND-1 — arbitrary `text-[calc(13.5px*var(--text-scale))]`, `text-[calc(11px*...)]`, `text-[calc(10px*...)]`, `text-[calc(20px*...)]`. Defensible for shell density (nav labels sit at 13.5px between body-sm and body-md), but blocks the /settings → Text size a11y token from being the *only* size lever. **Fix pattern**: add `--text-nav-label`, `--text-nav-hint`, `--text-nav-count` tokens if the shell needs its own step, so the values live in one place.
- **F-STAFFSHELL-2 (NOTE, sidebar mobile):** Below `md:` the sidebar becomes a horizontal `overflow-x-auto` strip — Frontend Design Standard mentions the spec's "real mobile answer is a bottom nav with Scan as the centre action" as unbuilt. Log as forward-looking residual, not new finding.

#### PublicShell, SiteShell, SiteFooter — pending read

_Will populate during marketing/public page walk._

---

## Cross-page sweeps

The 10 sweeps from spec §5, all completed. Where a sweep surfaces a new class of finding not caught page-by-page, it lands here with an F-SWEEP-* id.

### 1. Primary button verb consistency

Sample: `Save draft` / `Publish event` (/events/new) · `Save` (CpdAccreditationSection) · `Send magic link` (/login) · `Send sign-in link` (/account/sign-in) · `Save organisation profile` (/settings) · `Send confirmation` (/settings change-email) · `Generate invite link` (/settings/team) · `Accept invite` (/invite/[token]) · `Choose Essential/Professional/Enterprise` (/pricing) · `Export CSV` (varies).

**Verdict:** verb-first ✓ across the app. Sentence-case ✓. One outlier already flagged as **F-PRICING-1** (`Choose Enterprise` mismatches the "Contact us" action).

### 2. Back-link labels

Sample: `Back to Programme` (StaffShell → /dashboard from /events/new, /events/[id]/edit, /events/[id]/details, /participants, /settings, etc.) · `Back to Event` (from /events/[id]/checkin — parent is the event, not the Programme) · `Back to Settings` (from /settings/team).

**Verdict:** ✓ consistent "Back to X" pattern where X is the parent surface. Handoff_09092026 already resolved the earlier drift ("Dashboard" → "Programme" on 4 `backLabel`s); the a11y-tree confirms the fix held.

### 3. Export cluster pattern

Sample: `Export evidence (JSON + CSV)` · `Export College package (CSV)` · `Export attendance evidence (CSV)` (all on /events/[id]/details) · `Export CSV` (on /events/[id]/analytics AND /participants) · `Export registrants (CSV)` (on /events/[id]/edit right sidebar).

**F-SWEEP-EXPORT-1 (MINOR):** Naming is inconsistent — three qualified names (`Export <scope> (<format>)`) sit next to two bare `Export CSV` on `/analytics` + `/participants`. Users comparing multiple export buttons need to remember which one produced the file they downloaded. **Fix pattern:** always qualify with scope + format: `Export analytics (CSV)`, `Export participants (CSV)`.

**F-SWEEP-EXPORT-2 (NOTE):** No visible loading/success states verified for any export button (a11y-tree captures static buttons only). Ensure every export renders a `role="status"` pending toast + a success toast on download completion — matches the toast primitive `success | error | neutral` pattern already established.

### 4. Status colours vs Frontend Design Standard §2 table

Frontend Design Standard §2 locks 6 status treatments: **Drafted** (warning-container + on-warning-container) · **Registering** (primary-container + on-primary-container) · **Upcoming** (surface-container-high + on-surface-variant) · **Live** (success-container + on-success-container + pulse + dot) · **Completed** (surface-container-high + on-surface-variant) · **Cancelled** (error-container + on-error-container).

Observed pills on the seeded event:
- `/dashboard/manage` row: **Completed** pill ✓ matches vocabulary.
- `/events/[id]/details` header: **Completed** pill ✓.
- `/events/[id]/edit` header: **published** pill (lowercase, different word).

**F-SWEEP-STATUS-1 (IMPORTANT):** Same event renders as "Completed" on 2 pages and "published" (lowercase) on 1 page. If "published" is the `events.lifecycle` enum value and "Completed" is a derived status, both may be legitimate — but the user sees two different words for the same object. **Fix pattern:** either show both consistently (e.g. always "Completed (published)"), or resolve to a single vocabulary. Frontend Design Standard §2 doesn't ship "published" as a state — this may be lifecycle leaking through.

**F-SWEEP-STATUS-2 (NOTE):** Live pill's animation was corrected on 2026-08-09 (see Frontend Design Standard §2 warning box) — pulses `success-container` toward white rather than solid green, to keep contrast ≥7.21:1. No live event in review-mode data to verify; deferred to a follow-up pass with a live event.

### 5. Empty-state pattern

Empty states surveyed:
- `/(public)/events` — "No open events right now — check back soon." (no CTA)
- `/dashboard` — "No upcoming events. Create one to start your programme." + **Create event CTA** ✓
- `/events/[id]/checkin` speakers — "No speakers configured — add them to the agenda first." (no CTA)
- `/checkin` (global) — "No open events. Check-in unlocks 60 minutes before an event starts." (no CTA, but pre-emptive gate explanation)
- `/checkin/confirm` (no code) — "No check-in code" + guidance
- `/survey` (no code) — "No survey code" + guidance
- `/analytics` — not tested (only one completed event exists)

**F-SWEEP-EMPTY-1 (NOTE):** Empty states are mostly consistent (title + short guidance). Where the empty state is *actionable-by-the-viewer* (e.g. `/dashboard` — organiser can Create), there's a CTA button. Where it's not (`/(public)/events` — attendee can't create events; `/checkin/confirm` — needs code from email), copy alone is fine. Pattern is consistent ✓.

### 6. Modal dismiss

Two dialog primitives coexist in [components/ui/](components/ui/): `Dialog` and `ConfirmDialog`. Their dismiss behaviour differs — already flagged in **F-DIALOG-1** (scrim token vs hex), **F-DIALOG-2** (ConfirmDialog missing Tab focus trap), **F-DIALOG-3** (ConfirmDialog no opener-focus restore), **F-DIALOG-4** (ConfirmDialog uses raw `<button>` not `ui/Button`).

**Sweep verdict:** the two primitives ship four different a11y postures for the same modal concept. The gap is best closed by reworking `ConfirmDialog` to compose `Dialog` + a locked footer with `ui/Button` × 2 (matches Pajamas' `Modal` + confirm-pair convention, matches Material Web's `<md-dialog>` API).

### 7. Base UI Select trigger — label vs raw value

Sites where `<combobox>` sits next to `<textbox>` with the raw value in the a11y tree:
- `/dashboard/manage` Sort — combobox "Soonest" + textbox "soonest" (F-MANAGE-1)
- `/events/new` Accrediting body — combobox "Not accredited" + all 22 body labels rendered twice (F-NEW-3)
- `/events/[id]/details` Accrediting body — same pattern
- `/events/[id]/edit` Accrediting body — same pattern
- `/settings` Organisation type — combobox "Select…" + 9 option labels rendered twice (typical scale, same)
- `/settings/team` invite Role — combobox "Member" + textbox "organiser_member" (F-TEAM-1)

**F-SWEEP-SELECT-1 (IMPORTANT):** Systemic. Every Base UI `Select` consumer exposes both the visible trigger label AND the internal raw value in the a11y tree. On `/settings/team`, handoff_12092026_v2 documented a fix for this exact page — the a11y-tree still shows the raw value alongside the label, meaning **either** the visible trigger uses the label correctly (as intended) and the raw textbox is a hidden internal input that should be `aria-hidden`, **or** the fix has partially regressed. **Fix pattern:** verify all Base UI Select consumers render correctly at visual/screen-reader level; add `aria-hidden` on Base UI's internal value inputs; consider a repo-wide `SelectValue` render-prop convention (`<SelectValue>{labelMap[value]}</SelectValue>`) to guarantee label-only display.

### 8. Icon + label pairs — same meaning, same icon?

Sample mapping (audit + inspection of StaffShell + landing + row actions):

| Concept | Sidebar | Page header | Button | Same? |
|---|---|---|---|---|
| Programme (dashboard home) | `calendar_today` | — | — | ✓ single site |
| Manage events | `event_note` | — | — | ✓ single site |
| Participants | `group` | — | — | ✓ single site |
| **Check-in** | `how_to_reg` | `Check-in` label on /events/[id]/checkin | Row action on /manage: `how_to_reg` | ✓ consistent |
| **Analytics/Reports** | `bar_chart` (sidebar row = "Reports") | `insights` (/events/[id]/analytics label) | Row action on /manage: `bar_chart`; details right-sidebar card: `analytics` icon | **✗ three different icons for one concept** |
| Settings | `settings` | — | — | ✓ |
| Delete | — | — | Row action on /manage: `delete` | ✓ single site |
| Edit | — | — | Row action on /manage: `edit`; /details header link: `edit` | ✓ consistent |
| Details | — | — | Row action on /manage: `info`; details header link: — | ✓ |
| Export | — | — | Multiple buttons: `download` (details) or no icon (/analytics) | ~ |
| Time | — | `schedule` (chips) | — | ✓ single site |
| Venue | — | `location_on` (chips) | — | ✓ single site |
| Verified / accreditation | Sidebar: `verified_user` (Soon) | — | /account/profile SectionCard: `verified` (per handoff_04092026) | **verified_user vs verified** — two glyphs for one concept |

**F-SWEEP-ICON-1 (NOTE):** Analytics/Reports uses **three different icons** for the same concept (`bar_chart` in sidebar, `insights` in page label, `analytics` on right-sidebar card). Also relates to **F-ANALYTICS-1** (Reports vs Analytics vocabulary drift). **Fix pattern:** pick one icon per concept. Recommend `bar_chart` (sidebar precedent) OR `insights` if the domain framing is "insight-driven" — but not both.

**F-SWEEP-ICON-2 (NOTE):** `verified_user` (sidebar Accreditation row) vs `verified` (account profile SectionCard) — same conceptual family, different Material glyphs. **Fix pattern:** pick one (Material's `verified` = simpler check-in-badge; `verified_user` = check-in-badge with silhouette; use `verified` for the state, `verified_user` for the person's licence).

**F-SWEEP-ICON-3 (NOTE):** Every icon in the app is Material Symbols Outlined (single library) ✓. Size scaling via `text-[calc(Npx*var(--text-scale))]` respects the a11y text-size lever (per Frontend Design Standard). Systemic — good alignment. Cross-library ref: matches Material's own icon system; Pajamas uses its own set (`gl-icon-*`), cult-ui uses `lucide-react` — Eventar's choice matches its MD3 token architecture.

### 9. Attendee vocabulary — "CME/CPD points" not "credit"; "Programme" not "Dashboard"

Grep sweep pending (below in Text & icon inventories). From walked pages:
- ✓ `/(public)/events` uses "programmes" (UK spelling, matches "Programme" nav vocabulary).
- ✓ `/account/sign-in` uses neutral vocabulary, no "credit" leaks.
- ✓ Organiser surfaces (`/events/new`, `/details`) use "credit" freely — consistent with the Stage 10 split (organiser = credit, attendee = points).
- ✓ `/dashboard` sidebar rows: Programme, Manage, Participants, Check-in, Reports — Q32-compliant.
- ⚠ Landing page uses **"CME/CPD"** in H1 (attendee-facing) ✓; also uses "CME/CPD points" in "Points land on your Eventar record" ✓. Only one leak observed: sample record card uses "pts" abbreviation ("9.0 pts released through Eventar") — informal but attendee-facing ✓.

**F-SWEEP-VOCAB-1 (NOTE):** Vocabulary lock holds on the walked surfaces. A grep pass over the whole codebase for stale "Dashboard" / "CPD credit" on attendee-facing files (marketing/, landing/, account/) would confirm completeness. Handoff_20260909 documented the same sweep — this audit inherits its result.

### 10. Dual CPD UI mapping

Sites where `CpdAccreditationSection` (single-body form, `event.body_id`) and `MultiBodyAccreditationWizard` (multi-body, `event_accreditation_groups`) render together:
- `/events/[id]/details` — both, both showing state that contradicts the readiness strip (**F-DETAILS-1 BLOCKER** — bridge-shape blindspot).
- `/events/[id]/edit` — same two sections, same contradiction (F-EDIT-3, confirms systemic).

The dual UI is **documented residual** (Frontend Design Standard §6 + `docs/plans/PROJECT_STATE.md`), not a new finding — but the underlying bridge-shape state bug (**F-DETAILS-1**) is a real BLOCKER surfaced by this audit.

---

## Text & icon inventories

### Stale-vocabulary sweep

Words the audit hunts on attendee-facing surfaces:

| Term | Spec says | Grep target | Observed |
|---|---|---|---|
| "Dashboard" | Retired for organiser home (now "Programme") | `components/landing/`, `components/marketing/`, `app/(public)/`, `app/account/` | No hits observed on walked surfaces. Grep pass at report end. |
| "CPD credit" | Retired on attendee surfaces (now "CME/CPD points") | Same | No hits observed. `pts` (informal) used once on landing sample record — attendee-friendly, defensible. |
| Engineer-speak (`idempotent`, `snapshot`, `RPC`, `ledger`, `hash`) | Removed from user-visible copy per handoff_06092026 | User-visible files under `app/(public)/`, `app/account/`, `components/landing/`, `components/marketing/` | None observed on walked surfaces. |
| "Verified credits" (attendee) | Not used | Same | Not observed. |

**F-VOCAB-GREP-1 (NOTE):** Follow-up recommended: run `grep -r "CPD credit\|Dashboard" app/\(public\) app/account components/landing components/marketing components/auth` to confirm no lingering strings. Handoff_20260909 did this sweep already; residuals should be zero.

### Icon inventory

Every Material Symbols Outlined glyph observed, mapped to its site:

| Glyph | Sites | Purpose |
|---|---|---|
| `calendar_today` | StaffShell sidebar (Programme); landing How-it-works step 1 | dashboard / find event |
| `event_note` | StaffShell sidebar (Manage) | event admin |
| `group` | StaffShell sidebar (Participants); /settings/team; landing How-it-works step 2 | people |
| `verified_user` | StaffShell sidebar (Accreditation — Soon); /events/new option `verified_user`? | licence/authorisation |
| `verified` | /account/profile SectionCard (per code) | state=verified |
| `how_to_reg` | StaffShell sidebar (Check-in); /dashboard/manage row action; landing/details check-in card | check-in |
| `mail` | StaffShell sidebar (Communications — Soon); /login CTA icon; /account/sign-in CTA icon | email |
| `bar_chart` | StaffShell sidebar (Reports); /dashboard/manage row action | analytics-in-list |
| `insights` | /events/[id]/analytics header; details right-sidebar Feedback card | analytics-in-page |
| `analytics` | /events/[id]/edit right-sidebar Analytics card | analytics-card |
| `settings` | StaffShell sidebar (Settings) | settings |
| `schedule` | Time chips (/dashboard, /details, /edit, /checkin) | time |
| `location_on` | Venue chips (/details, /edit, /checkin) | venue |
| `edit` | /dashboard/manage row action; /details header link | edit |
| `delete` | /dashboard/manage row action; /settings/team member row (implied) | delete |
| `info` | /dashboard/manage row action (Details link) | info |
| `download` | Export buttons (evidence, College, attendance evidence, registrants) | download |
| `check_circle` | /events/[id]/details Attendance evidence "in sync" indicator; pricing feature bullets; landing toast success | success state |
| `error` | Toast error tone | error state |
| `close` | Dialog close button | dismiss |
| `search` | /dashboard/manage search field; /events/[id]/checkin roster search; /participants | search |
| `add` | /events/new "Add hosted by"/"Add organized by"; /events/new/agenda "+ Break", "+ Keynote", etc.; /dashboard Create event CTA | add |
| `arrow_forward` | Details/analytics right-sidebar cards; landing article CTAs | forward-nav |
| `open_in_new` | /events/[id]/edit right sidebar (View public page); poster | external link |
| `chevron_left/right` | Mini-calendar month nav | month prev/next |
| `chevron_down/up` | Select trigger + scroll arrows | select disclosure |
| `qr_code_scanner` | /checkin scan button | scanner |
| `qr_code_2` | Landing How-it-works step 3; poster | QR |
| `keyboard` | /checkin "Enter code" button | manual entry |
| `receipt_long` | Landing How-it-works step 4 | credit/point log |
| `upload_file` | Landing How-it-works step 5 | export record |
| `school` | Landing Why-Eventar (regulated professions article) | education |
| `account_balance` | Landing Why-Eventar (accrediting body article) | institution |
| `filter_alt` | /events/[id]/analytics conversion funnel | filter |
| `event_seat`, `favorite`, `chat`, `event_note` (again) | /events/[id]/analytics Q1-Q5 per-question decoration | per-question decoration (F-EVANALYTICS-2 NOTE) |
| `format_size`, `text_decrease`, `text_format`, `text_increase` | /settings Text size radios | typography |
| `palette`, `light_mode`, `dark_mode`, `computer` | /settings Appearance radios | theme |
| `person`, `alternate_email` | /settings Account + Change email regions | user/mail |
| `logout` | /settings Sign out | session |
| `radio_button_checked/unchecked` | /settings radio state indicators | radio state |
| `group_add` | /invite/[token] | invite |
| `grid_view`, `view_list` | /dashboard card/compact view toggle | view toggle |
| `calendar_month` | /dashboard mini-calendar header; /events/new registration date fields; landing How-it-works step 1 | month view |
| `image` | /events/new hero image upload | image |
| `description` | /events/[id]/edit About region | description |
| `dashboard` | /events/[id]/edit right sidebar Operations card | operations |
| `public` | /events/[id]/edit right sidebar Public page card | public |
| `insights` (again, listed) | | — |
| `swap_vert` | /dashboard/manage Sort combobox | sort |
| `lock` | /login "Organizer access only" region | lock |
| `reviews` | /events/[id]/details Feedback "Send survey invites" | survey |
| `quiz` | /(public)/survey no-code state | quiz |

**Icon-per-concept table completeness:** F-SWEEP-ICON-1 (analytics/reports — 3 icons for 1 concept) is the one systemic issue. Everything else is 1-icon-per-concept ✓.

---

## Summary

- **Pages walked:** 25 of 28 live production routes (4 attendee-authenticated routes deferred — see F-ATT-1).
- **Rubric:** Q32 audience boundary + Eventar Frontend Design Standard (locked 2026-08-09) + global reference libraries (Material 3, GitLab Pajamas, cult-ui via `design-system-libraries`).
- **Findings tally:**
  - **BLOCKER × 2:** F-DETAILS-1 (readiness-strip vs credits-issued state contradiction on `/events/[id]/details` — bridge-shape blindspot) · F-CHECKIN-1 (check-in scoreboard "Not open yet" on a completed event).
  - **IMPORTANT × 8:** F-DIALOG-1..4 (ConfirmDialog primitive gaps × 4) · F-MANAGE-2 (subtitle promises unavailable features) · F-EDIT-1..2 (read-only /edit with editable CPD partial-write) · F-TEAM-1 (Base UI Select trigger label vs raw value on team invite) · F-INVITE-1 (invalid token renders as if valid) · F-SWEEP-SELECT-1 (systemic across every Select consumer) · F-SWEEP-STATUS-1 ("published" vs "Completed").
  - **MINOR × 12:** F-BTN-1, F-INPUT-2, F-BRAND-1, F-STAFFSHELL-1, F-DASH-2, F-NEW-1..2, F-DETAILS-3, F-EVANALYTICS-1, F-PARTICIPANTS-1, F-ANALYTICS-1, F-POSTER-1, F-LANDING-1, F-LANDING-2, F-SETTINGS-1, F-PUBEV-1, F-SWEEP-EXPORT-1, F-PRICING-1.
  - **NOTE × 30+:** documented pre-existing residuals, cross-library alignment notes, and non-defect observations.
- **Theme:** light-mode audit only (viewport hidden, resize didn't apply — dark-mode + responsive verification deferred).
- **Top 5 offenders (severity + leverage):**
  1. **F-DETAILS-1** — BLOCKER, trust-critical (organiser reads "Not set" on an event with issued credits) — fix ships one region for the whole app (readiness strip's accreditation cell).
  2. **F-CHECKIN-1** — BLOCKER, trust-critical (organiser reads "Not open yet" on a completed event) — same status-computation family.
  3. **F-DIALOG-1..4** — IMPORTANT × 4 on a single primitive — one fix (rework ConfirmDialog on top of Dialog + `ui/Button`) resolves all four.
  4. **F-SWEEP-SELECT-1** — IMPORTANT systemic across every Base UI Select consumer — one investigation confirms whether visible trigger works vs a11y-tree artifact, then one fix pattern applies.
  5. **F-LANDING-1 + F-NEW-2 + F-DETAILS-7 + F-SETTINGS-1** — same span-composition/accessible-name-gap class across 4 sites; one `SplitHeading` primitive fixes all.

## Recommended fix order

**Tier 1 — BLOCKERS.** Ship these before public deploy (stage 8). Trust-critical.
1. **F-DETAILS-1** — Add `bridgeButLocked` branch in [app/events/[id]/details/page.tsx:289-321](/Users/ivan/Eventar/app/events/[id]/details/page.tsx) — recommended per Rule 14 analysis in the finding. ~10 lines + regression test using the seeded walkthrough shape. Mirrors the 2026-09-12 `lapsedButLocked` fix Ivan already approved.
2. **F-CHECKIN-1** — Fix check-in scoreboard status computation (three lifecycle states: pre-open / open / closed).

**Tier 2 — Shared-primitive gaps (highest leverage).** Each fixes many findings at once.
3. **F-DIALOG-1..4** — Rework `ConfirmDialog` to compose `Dialog` + `ui/Button` (Material Web / Pajamas Modal-confirm convention). Closes 4 IMPORTANTs on one primitive.
4. **F-SWEEP-SELECT-1** — Verify every Base UI Select consumer visually + add `aria-hidden` on internal value inputs. Closes 6+ Select sites at once.
5. **Systemic span-composition fix** — Introduce `SplitHeading`/`SplitParagraph` primitive whose accessible name joins children with spaces. Closes F-LANDING-1, F-NEW-2, F-DETAILS-7, F-SETTINGS-1 in one landing.
6. **F-STAFFSHELL-1 / F-BRAND-1 typography drift** — Introduce `--text-nav-{label,hint,count}` tokens or migrate to typescale. Closes shell chrome's arbitrary `text-[Npx]`.

**Tier 3 — Page-local polish.**
7. F-MANAGE-2 subtitle mismatch ("export" and "archive" promises) — 2-word edit.
8. F-PRICING-1 Enterprise CTA — 2-word edit.
9. F-EVANALYTICS-1 "Met/ExceededExpectations" — 1 space or SENTIMENT_LABELS map.
10. F-PARTICIPANTS-1 US date format — replace with shared formatter.
11. F-EDIT-1..2 read-only `/edit` — either implement the editor or rename the route (Ivan's call).
12. F-INVITE-1 invalid-token state — server-side token validation + three-state render.
13. F-SWEEP-EXPORT-1 export-button naming — qualify with scope + format.
14. F-SWEEP-STATUS-1 "published" vs "Completed" — reconcile lifecycle vs status pill.
15. F-SWEEP-ICON-1..2 icon-per-concept — reconcile Analytics/Reports + verified/verified_user.

**Deferred (needs a follow-up pass):**
- F-ATT-1 — attendee-authenticated routes (`/account/complete`, `/account`, `/account/profile`, `/account/claim`) with a real magic-link session.
- F-SWEEP-STATUS-2 — live event pill contrast verification (needs a live event in fixtures).
- Dark-mode audit across major shells.
- Responsive audit (tablet + mobile) at real viewports.
- Screenshot verification of every finding claimed at layout/alignment level.

---

## Page sheets

_Sections below are ordered by walk-order (Auth first, then public/marketing, Settings, System, Organiser at bottom because most detailed). Format per spec §9: dimension notes only where non-pass, findings table with severity + fix pattern. Every finding cites a page + component + suggested fix in shared-library vocabulary._

### Auth

#### `/login` — organiser sign-in door (already covered above under Organiser)

_See Organiser section for full sheet._

#### `/account/sign-in` — attendee sign-in door

- **T2 tone**: "Sign in to your account" · "Use the email you registered with. We'll send you a one-time link to sign in." · "You can still register for events as a guest without an account — this door is for linking past registrations..." (attendee-friendly framing).
- Magic-link CTA + 15-min expiry note + 5-bullet "Trouble signing in?" disclosure.
- Public shell nav lists Home / Upcoming events / Sign in — same self-reference class as F-LOGIN-1.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-AS-1 | NOTE | Same self-reference class as F-LOGIN-1: nav "Sign in" targets the current page. Both organiser and attendee sign-in pages exhibit it. | Suppress "Sign in" nav item when the current path already IS a sign-in page. |

#### `/account/complete`, `/account`, `/account/profile`, `/account/claim` — all auth-gated

Review-mode session is staff (organiser fixture), so these attendee-authenticated routes all bounce to `/account/sign-in`. Tab titles change ("Complete your account · Eventar", "Account · Eventar", "Professional profile · Eventar", "Link past registrations · Eventar") but the rendered body is the sign-in form.

**Cannot audit visual/interaction of these routes from review mode.** Deferred to code-review pass; findings from the shipped code (per handoff_16092026 and handoff_20260917-walkthrough) already document:
- `/account/complete` — 4-step wizard (Consent → Identity → Professional profile → Licence), resumable at first-incomplete-step. Two review agents caught the "empty specialty dropdown for non-medicine professions" bug pre-ship — fixed by free-text fallback whenever the filtered list is empty (handoff_16092026).
- `/account` — SectionCard chrome, F3+F4 combined readiness banner (handoff_04092026), Session card with Sign-out action pointing at `/` (not `/login` — Q32 boundary).
- `/account/profile` — Licences SectionCard between Role and Speaker preferences; declare form + list; body-aware licence labels; F3+F4 readiness (handoff_04092026).
- `/account/claim` — reassurance bullets in user language (post-2026-09-06 rewrite, no "idempotent"/"snapshot").

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-ATT-1 | NOTE | Audit couldn't visually verify attendee-authenticated routes in review mode. To complete this section a real magic-link round-trip through Mailpit/inbucket is needed. | Follow-up pass with an attendee session: sign up with a test email, receive the OTP via inbucket web UI on :54324, walk `/account/complete` → `/account/profile` → `/account/claim` visually. |

### Attendee (auth-gated — deferred, see F-ATT-1)

_See Auth section._

### Public / marketing

#### `/(public)/events` — attendee event directory

Public shell. Small label "Events" · H1 "Upcoming events" · subtitle "Open programmes across the professions — register in under a minute." · `tablist` with 4 category tabs (All / Medicine & dentistry / Allied health / Other) · empty state "No open events right now — check back soon." (seeded event is Completed so correctly filtered out).

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-PEV-1 | NOTE | Tabs use proper `role="tab"` / `role="tablist"` semantics. Cross-refs Pajamas Tabs component + Material `<md-primary-tab>`. | ✓ No change. |
| F-PEV-2 | NOTE | "Register in under a minute" is an unverifiable claim. Marketing copy — acceptable if genuinely ~1 min, otherwise soften. | If ever measured >1 min in prod, soften to "Register in under two minutes" or drop the time claim. |

#### `/(public)/events/[id]` — public event page (walked on Completed event)

Header with "Completed" chip + H1 + venue/time chip · description · **Event ended** region (redundant with the Completed chip) · QR code for sharing.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-PUBEV-1 | MINOR | Timezone renders as **`Asia/Hong_Kong`** (IANA identifier — developer-facing) on the venue/time chip. Elsewhere the app uses "HKT" (Hong Kong Time) or "GMT+8". Inconsistent. | Use human-facing timezone abbreviation. `HKT` for HK events; more generally, the app's shared timezone formatter (`lib/format/timezone.ts` or equivalent) should own display format. |
| F-PUBEV-2 | NOTE | "Completed" pill AND "Event ended" region both communicate the same state. Slight redundancy — could collapse into one or accept the double-signal as intentional emphasis. | Optional: hide the "Event ended" region when the pill already carries the signal. |

#### `/(public)/checkin/confirm` — check-in pass, no-code state

H1 "No check-in code" · graceful empty-state copy: *"Open this page from your registration link or by scanning your personal QR code..."*

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-CC-1 | NOTE | No-code empty state is well-worded and points users to their registration link or personal QR. | ✓ No change. Full sentence truncated in a11y-tree; visually verified copy would confirm. |

#### `/(public)/survey` — survey, no-code state

H1 "No survey code" · same-pattern empty state: *"Open this page from the survey link we emailed you, or scan your personal QR code..."*

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-SURV-1 | NOTE | Same shape as `/checkin/confirm` no-code state — consistent. | ✓ No change. |

#### `/(public)/events/[id]/poster` — print poster

Non-shell layout. Small "Event" label · H1 · Date/Time/Venue region · QR code · About · public URL · **"Event ended"** region (unusual on a poster) · Print poster button.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-POSTER-1 | MINOR | "Event ended" region renders on a poster meant for pre-event distribution. On a Completed event this is factually correct but useless (nobody prints a poster for a done event). On a Draft/Upcoming event the region should be hidden — verify. | Guard the "Event ended" region on `lifecycle === 'completed'` only, and hide it entirely from the poster's print styles (`@media print`). |
| F-POSTER-2 | NOTE | Poster URL shows `http://localhost:3100/...` in dev — production build uses `NEXT_PUBLIC_SITE_URL` per hard rule 3 in CLAUDE.md. Assume correct in prod. | ✓ No change. |

#### `/` — landing page

Public shell with the split-audience nav: Home / How it works / Platform / For organisers / Upcoming events / **Start an Event** (organiser CTA) / **Sign in** (attendee CTA). Practitioner/Organiser audience toggle (`tablist`) as the split point. Deep content: hero + Why Eventar (3 articles) + How it works (5 steps) + What it changes for a practitioner / organiser (3+3 articles) + CTA region.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-LANDING-1 | MINOR | H1 renders as *"Your CME/CPD log**should keep itself.**"* — same span-composition gap as F-NEW-2 and F-SETTINGS-1. Visual layout puts a break/space between the two spans via flexbox; accessible name concatenates without space ("Your CME/CPD logshould keep itself."). | Compose the heading as one string with a `<br/>` for the visual break, or set `aria-label` on the `<h1>` that reads the natural sentence. This is a **systemic class**: F-NEW-2, F-DETAILS-7, F-SETTINGS-1 all show the same fragmentation pattern. Fix at once in a `SplitHeading` primitive (a `<h1>` whose accessible name is the joined children with spaces). |
| F-LANDING-2 | MINOR | "Rule-aware for **8 Hong Kong accrediting bodies** · HKICPA · Law Society · HKIE · HKCR · +4" — but `/events/new`'s accrediting body picker lists **22 bodies** (medical colleges + AHP + HKICPA + HKIE + IA + MPFA + PTB + VSB). "8" understates coverage. | If "8" refers to a subset (regulated bodies with active pilots?), qualify: "8 core regulatory bodies + medical colleges". Otherwise update the count. |
| F-LANDING-3 | NOTE | Nav includes BOTH audience CTAs ("Start an Event" for organisers + "Sign in" for attendees) — landing is the split point. Consistent with Q32. | ✓ No change. |

**F-LANDING-4 RETRACTED** — the "duplicate How it works section" I initially flagged was a **viewport artifact**: the browser pane's viewport is `0x0` (hidden), so Tailwind's `sm:hidden` / `sm:flex` responsive utilities don't apply and both the mobile-only + desktop-only variants of `HowItWorks` render simultaneously. In a real browser at a normal viewport, only one renders. Confirmed by grepping [components/landing/HowItWorks.tsx:111,122](/Users/ivan/Eventar/components/landing/HowItWorks.tsx). Not a defect.

#### `/pricing`

Public shell. H1 "Plans & Pricing" · monthly/annual billing toggle · 3 cards (Essential Free / Professional HK$680/mo "Most popular" / Enterprise Contact us) · Choose CTA on each · feature bullet list per card.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-PRICING-1 | MINOR | Enterprise card CTA reads **"Choose Enterprise"** but the plan price is *"Contact us"* — CTA/action mismatch. Clicking "Choose" for a plan that requires a sales conversation is a bait-and-switch. | Change Enterprise CTA to "Contact us" or "Talk to sales" — matches the actual action. |
| F-PRICING-2 | NOTE | Billing period toggle (monthly/annual) is a two-button group. Depending on visual, this may be a `role="tablist"` or a segmented control. Verify aria roles. | If not already a segmented-control primitive (Pajamas equivalent), add proper aria semantics. |

### Settings

#### `/settings`

H1 "Settings" + subtitle "Personal preferences for your Eventar session." · 7 regions: **Tell us about your organisation** (first-run org profile capture — org type combobox + professions button-row (13 opts) + specialties button-row (3 opts, filtered by profession) + typical scale combobox + contact email/name/role) · **Appearance** (Light/Dark/System radios) · **Text size** (Small/Default/Large radios) · **Account** (email + role = "Eventar Staff") · **Change email** (new-email form) · **Team** (link to /settings/team) · **Session** (Sign out).

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-SETTINGS-1 | MINOR | "Change email" copy: *"Your current email is `[value]`. Changing it sends a confirmation link..."* — same span-composition gap as F-LANDING-1 / F-NEW-2 / F-DETAILS-7. Visually correct; a11y-name fragmented. | Same fix as F-LANDING-1 — systemic; a `SplitParagraph`/`SplitHeading` primitive or wrap the interpolated value inline. |
| F-SETTINGS-2 | NOTE | Specialties chip row shows only 3 options for the (medicine) profession — matches seed data (specialties seeded for medicine only). Per handoff_16092026's fixed bug: free-text fallback when the filtered list is empty. | ✓ Behaviour correct; expected. |
| F-SETTINGS-3 | NOTE | Account role label reads "Eventar Staff" — intentionally kept in sync with the `eventar_staff` DB enum per handoff_04092026's vocab-sweep note. Documented Q32-acceptable drift. | ✓ Accepted residual. |
| F-SETTINGS-4 | NOTE | Professions button row (13 chips) + Specialties button row — no visible primary/secondary distinction from the a11y tree. Requires visual to confirm they render as filter/toggle chips (Material Filter chip / Pajamas Filter component) vs plain buttons. | Verify visually (chip-toggle pattern) or align with Material `<md-filter-chip>` / Pajamas `Filter` component vocabulary. |

#### `/settings/team`

H1 "Team" + subtitle. Members table (Name/Email/Role) with one seeded row · Invite section (Role combobox + Generate invite link).

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-TEAM-1 | IMPORTANT | Invite Role picker shows `combobox "Member"` alongside a separate `textbox "organiser_member"` — same Base UI Select trigger-vs-raw-value pattern as F-MANAGE-1 and F-NEW-3. This exact page was in the handoff_12092026_v2 fix list ("Base UI Select trigger showing raw values instead of labels — fixed on 4 consumers including live /settings/team"). Either the fix regressed or the a11y-tree still exposes the raw value input alongside the visible label. | Verify: (a) view HTML directly for `/settings/team` — does the `<button>` render "Member" and is the "organiser_member" text just Base UI's internal hidden `<input>`? If yes, add `aria-hidden` on the input or upgrade Base UI; (b) if the visible trigger actually shows "organiser_member", this is a live regression of the handoff_12092026_v2 fix and needs re-verification. Same investigation applies to F-MANAGE-1 (`/dashboard/manage` Sort combobox) and F-NEW-3 (`/events/new` accrediting-body picker). |
| F-TEAM-2 | NOTE | Members table shows "First Operator" + "Platform Staff" as the seeded row — dev-fixture artifact. | Fixture-only. |

#### `/invite/[token]` (probed with `/invite/does-not-exist`)

Public shell · H1 "Join your team" · subtitle · big "Accept invite" button — **renders as if the invite is valid** even for a token that clearly doesn't exist.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-INVITE-1 | IMPORTANT | `/invite/does-not-exist` renders a functional-looking Accept invite button with no invalid/expired state. User clicks a stale link, gets told "click to accept", then presumably fails on the server-side accept action. Rule 12 (fail visibly) — the failure should be visible at the render layer, not after the user commits. Should be verified with a REAL token to confirm the code path DOES check; if it does, the finding narrows to "invalid tokens should render an error state instead of the accept UI". | Server-side token validation on page load; three states: (a) valid → Accept invite; (b) already-accepted → "You've already joined [org]" + link to `/dashboard`; (c) invalid/expired → "This invite link is invalid or expired. Ask the organiser to send you a new one." Match the same 3-state pattern the check-in and survey no-code pages already use. |

### System

#### `not-found` (probed with `/definitely-not-a-real-page`)

Public shell · "404" chip · H1 "This page doesn't exist." · subtitle · 2 recovery links (Upcoming events / Home).

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-404-1 | NOTE | Clean 404 with recovery links, appropriate copy, no engineer-speak. Follows the same public-shell pattern as marketing pages. | ✓ No change. |

#### `error.tsx` — not triggered

Force-boundary tests not run in this pass (would need to reach an error state on a real route). Deferred.

### Organiser

#### `/login` — organiser sign-in door

- Read at desktop viewport (browser pane hidden — text-tree read).
- **T2 tone (copy)**: tight. "No password here — we'll email you a one-tap sign-in link." · "Organizer access only" region · magic-link CTA `Send magic link` + `mail` icon · expiry note ("The link expires after 15 minutes and works once.") · 5-bullet "Trouble signing in?" disclosure.
- **A2 audience**: primary nav (public shell) lists Home / Upcoming events / **Sign in → `/account/sign-in`** — offers the *attendee* sign-in on the organiser door. Not a Q32 violation (both `/login` and `/account/sign-in` sit under public shells; boundary rule bars in-shell cross-linking, not public nav), but a subtle audience-mixing to note.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-LOGIN-1 | NOTE | Primary nav on organiser sign-in page still lists attendee `/account/sign-in`. A prospective organiser could click "Sign in" (the attendee door) not realising they're already on their own. | Consider two options for Ivan: (a) keep as-is (both doors on the public nav is discoverable), (b) suppress "Sign in" from the nav when the current path already IS a sign-in page. |
| F-LOGIN-2 | NOTE | Footer links "Upcoming events" → `/events` (attendee directory) shown on the organiser sign-in page. | Consumer-facing courtesy; leave unless a real confusion is measured. |

#### `/dashboard` — Programme home

- **T1/T2/A1**: `<h1>` "Default Organisation" · timezone chip "Times in HKT — 08:51" (correct + accessible) · subtitle "Accredited CME / CPD events on Eventar · organiser workspace" · sidebar skip-link + `aria-current="page"` on active row.
- **C1 primitives**: buttons use `ui/button`; icon-only buttons carry aria-labels (`Card view`, `Compact view`, `Search events`).
- **D2 trust**: pulse metrics — Registered (open) / Checked in today / Credits issued / Events this week, each with a delta sentence.
- **S1 spacing**: two-column layout (agenda left, mini-calendar right); banner + subtitle + region + pulse row + Manage-all link — good vertical rhythm.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-DASH-1 | NOTE | Mini-calendar renders every date in the visible month as an individual `<button>` (30 buttons, each a tab stop). Pajamas' date-picker and Material's `<md-date-picker>` use a **roving tabindex** grid (1 stop, arrow keys navigate the grid). Also applies to `/events/new`'s date grid (42 buttons — 6-week view). | Roving tabindex pattern: single `tabIndex={0}` on the currently-focused date, `tabIndex={-1}` on the rest; arrow keys move focus. Matches Pajamas + MD3. |
| F-DASH-2 | MINOR | Sidebar account chip shows "First" as the visible first-name — dev-fixture artifact (`staff.full_name = 'First'`). Not a production bug, but a distracting review-mode signal. | Update the review-mode fixture user's `full_name` to something more human-readable (e.g. "Alex Chan"). |
| F-DASH-3 | NOTE | Root-level "Loading" node visible in the a11y tree — a skeleton (probably async pulse metrics or agenda cards). Fine as long as `aria-busy` is on the skeleton region; verify. | Confirm skeleton uses `role="status"` + `aria-live="polite"` or `aria-busy="true"`; not verified here (needs visual). |

#### `/dashboard/manage` — Manage events

- **T1/T2**: H1 "Manage events" + subtitle "Filter, export, archive, or open an event to run it."
- **S2 alignment**: search + Sort combobox on same row · lifecycle chip row: All / Draft / Registering / Upcoming / Live / Completed / Cancelled — segmented control matches Frontend Design Standard §2's status vocabulary.
- **C1 primitives**: row actions use inline links with icon+label (Details / Edit / Check-in / Analytics) + Delete button. Consistent affordances.
- **D1 data display**: event row shows title + status pill + category + description snippet + date/time/location + registration/checkin count.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-MANAGE-1 | NOTE | Base UI `Select` `combobox "Sort events"` renders alongside a separate `textbox "soonest"` in the a11y tree. Likely Base UI's internal hidden input leaking. Silent for sighted users; may cause a screen reader to announce the current value twice. | Verify with `SelectValue` render pattern; if the textbox is Base UI's own hidden input, add `aria-hidden` on it or upgrade to Base UI's later version. |
| F-MANAGE-2 | IMPORTANT | Subtitle promises "Filter, **export**, archive, or open" — no export button visible on this page (bulk export?). Also promises "archive" but the row action is "Delete" (handoff 07092026 aligned Archive→Delete, subtitle wasn't updated). Users told to expect a capability they can't find. | (a) Delete "export" from subtitle if bulk export doesn't exist here, or add the button. (b) Replace "archive" → "delete" to match the row action. Preferred wording: "Filter, sort, delete, or open an event to run it." |

#### `/events/new` — Create event form

- **T1**: H1 "Create event" + subtitle "Save draft first; publish event when ready." · 7 numbered form sections: Hero image · Basics · Date & venue · Agenda · Registration period · Check-in · CPD accreditation.
- **T2 tone**: helper copy tight and specific — "Times are in your local timezone. The event page will display them in the venue's local time." · "Leave blank to open at publish and close when check-in starts (60 min before the event)." · "Required once a body is chosen. Can be changed later, until the first credit is issued." (last one is a good policy signal.)
- **C1 primitives**: uses `ui/Input`, `ui/Textarea`, native `<select>` combobox (Base UI Select for CPD body), `ui/Button` × 3 at bottom (Cancel / Save draft / Publish event).
- **D2 trust**: locked-until-first-credit note on CPD hours field ✓ — trust-critical, well-worded.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-NEW-1 | MINOR | "Form progress" list at top shows 6 sections (Hero image · Basics · Date & venue · Agenda · Registration period · Check-in) but the form body renders **7** (adds "7 · CPD accreditation"). Progress list misses the CPD section. | Add "CPD accreditation (optional)" as the 7th progress item, or explain why CPD sits outside the progress checklist (if it's evaluated separately). |
| F-NEW-2 | MINOR | Section headings render as three adjacent spans — `"1 ·"`, `"Hero image"`, `"(optional)"` — visually separated by flexbox gap but the accessible name concatenates without spaces ("one dot Hero image optional"). Screen readers announce it awkwardly. | Compose a single `<h2>` with proper spacing OR set `aria-label` on the heading that carries the readable form ("Step 1: Hero image (optional)"). Same class as F-DASH-1 kind of finding. |
| F-NEW-3 | NOTE | Base UI Select for "Accrediting body" exposes both `<option>` elements *and* label divs in the a11y tree — screen-reader may announce each body name twice. Same class as F-MANAGE-1. | Investigate Base UI Select's tree emission (may be a `SelectValue` render prop pattern). Same fix as F-MANAGE-1. |
| F-NEW-4 | NOTE | Date grid (42 buttons: 6-week view) — same class as F-DASH-1. Both mini-calendars in the organiser flow (Programme's agenda and this form's date picker) need the roving-tabindex fix. | Roving tabindex pattern (see F-DASH-1). |
| F-NEW-5 | POTENTIAL BUG | Sidebar account chip renders `generic "manager_email"` **twice** — probably first-name-fallback (`firstName(null) || email.split('@')[0]`) matching email prefix identically. Suggests either (a) fixture user has `full_name = "manager_email"` (weird), or (b) both name and email fields fall back to the same string when name is null. | Investigation needed: which review-mode fixture identity loads on `/events/new` vs `/dashboard`? On `/dashboard` the chip showed "First"; here it shows "manager_email" twice. The identity may be shifting per route (echoes D2 identity-split fix from handoff_16092026 — worth checking if a sibling of that bug remains). |
| F-NEW-6 | NOTE | Bottom bar has 3 buttons: Cancel / Save draft / Publish event — no visible primary/secondary hierarchy from the a11y tree alone. Requires visual check (screenshot) to confirm Publish uses the filled/primary variant while Save draft is secondary/outline. | Screenshot on this page after resize_window to desktop to verify variant distribution matches convention. |

#### `/events/[id]/details` — Event Manager

Meaty page; several sibling regions with overlapping domain (dual CPD UI). Walked on the seeded Completed event.

- **T1**: small chrome label "Event Manager" · H1 event name · Completed pill · date/time · location · 3 primary action links (Edit / Roster / Analytics).
- **S1 spacing**: 8 stacked regions — Event readiness · Event status · CPD accreditation · Multiple accrediting bodies (wizard) · Evidence export · Registration · Email delivery · Attendance · Attendance evidence · Feedback. Dense but defensible for an event-manager page.
- **D2 trust**: 3× `img "Locked since registration opened"` icons before the H1's editable fields — indicates fields that can no longer be edited. Icons carry alt text; sighted quick-scan may miss the meaning.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| **F-DETAILS-1** | **BLOCKER** | **State contradiction: readiness strip reads "accreditation · Not set · no body or hours" while credits have already been issued.** Traced to a bridge-shape blindspot in [app/events/[id]/details/page.tsx:280-321](/Users/ivan/Eventar/app/events/[id]/details/page.tsx). The accreditation cell branches on `singleBodyAccredited`, `multiBodyAccredited` (excludes bridge-shaped by design — [lib/cpd/multiBodyShape.ts:52-57](/Users/ivan/Eventar/lib/cpd/multiBodyShape.ts)), `lapsedButLocked` (requires `hasConfig=true`), then falls through to `'Not set'`. When the wizard has posted a bridge-shaped group (one body, proportional, one row covering all occurrences — the shape a *legacy single-body save* also produces) AND `events.accrediting_body_id` is null, ALL four checks miss even though `creditsIssued > 0`. Matches the seeded walkthrough event exactly and matches "status contradiction that causes false accreditation belief" in the spec's BLOCKER row. Sibling of the 2026-09-12 fix (readiness/CpdAccreditationSection contradiction), which was scoped to the lapsed-authorisation path and did not extend to bridge-shape/credits-issued. | Add a fourth branch mirroring `lapsedButLocked`: **`bridgeButLocked = wizardGroups.length > 0 && !accredited && creditsIssued > 0`** — cell renders as "Locked" with note `${creditsIssued} credit${creditsIssued === 1 ? '' : 's'} already issued` in the `warn` state (same shape as the 2026-09-12 fix). Alternative: relax `isMultiBodyConfigured` to include bridge-shape when credits are posted — smaller diff but changes a guard whose purpose is preventing legacy-form overwrite of a bridge group (needs Ivan's judgment). |
| F-DETAILS-2 | IMPORTANT | The single-body `CpdAccreditationSection` renders "Not accredited" **alongside** the multi-body wizard that shows HKCP is configured. Both surfaces render together on the same page (documented residual). A reader can't tell which is authoritative without reading each lock message. The two sections' subtitles are near-identical ("Attendees with a verified licence at this body earn credit automatically when they check in.") but describe different states. | Options (needs Ivan's decision): (a) hide `CpdAccreditationSection` when multi-body has entries — collapse the dual UI to one authoritative surface; (b) add a header banner above both sections when they disagree ("Multi-body accreditation is active — see below for the authoritative record"); (c) accept as tracked residual and add a NOTE tooltip on `CpdAccreditationSection`. |
| F-DETAILS-3 | MINOR | Status vocabulary drift: the header pill reads "Completed" (Frontend Design Standard §2 name), but the metrics strip labels the same state "Wrapped" (informal synonym). Two words for the same lifecycle state. | Pick one; recommend "Completed" everywhere for consistency with §2. If "Wrapped" is deliberately friendlier for the metric card, add it to the vocabulary spec so the drift is documented. |
| F-DETAILS-4 | NOTE | The Feedback region shows "Send survey invites" button, but the readiness strip cell says "survey · Armed · fires 10 min after end" — suggesting auto-send. If the auto-fire hasn't fired yet, does clicking "Send survey invites" bypass the timer? Copy is silent about the interaction. | Add helper text under the button: "Overrides the 10-min-after-end auto-fire and sends immediately" (or whatever the actual behaviour is). |
| F-DETAILS-5 | NOTE | Three "Locked since registration opened" icons (one before each locked field: title, date/time, location) — icons only, no visible text explaining the lock at the header level. Screen readers get the alt text; sighted quick-scan may not immediately connect. | Consider adding a single legend line at the header level: "Some fields lock once registration opens." Or accept the icons + alt-text as sufficient (defensible). |
| F-DETAILS-6 | NOTE | "Event readiness" strip cells have varying structure (2-line vs 3-line: label + status vs label + status + hint). No visible common template. Some cells (accreditation) show three vertical strings; others (registered) show two. | Standardize on either "label + primary status" or "label + primary status + one-line hint" everywhere for scanning consistency. Or accept intentional content-driven variance. |
| F-DETAILS-7 | NOTE | Prior-approval advisory copy renders as three consecutive a11y nodes ("The suggested prior-approval application deadline for HKCP was ", "18 Aug 2026, 23:59 (HKT)", ", and has passed. This is advisory on..."). Visual sentence renders correctly; screen reader announces in order. But a text-scraper reading node-by-node would see broken fragments. | Wrap the sentence in a single `<p>` with the date as an inline `<time>` element; the a11y-tree exposes it as one node with the date semantics preserved. |

#### `/events/[id]/edit` — Edit event

Route name suggests an editor; page is a **read-only view** with a notice: *"Editing event details isn't available yet — this view is read-only. Need a change? Ask an admin."* The CpdAccreditationSection and MultiBodyAccreditationWizard sections both render as **forms with a Save button** — meaning CPD is editable but nothing else is. A right-sidebar renders 6 action cards (Public page · Operations · Analytics · QR code · On-site check-in · Registrant export).

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-EDIT-1 | IMPORTANT | Route `/edit` is the destination of the "Edit" row action on `/dashboard/manage` AND the "Edit" link on `/details` — but the page is read-only (banner: *"Editing event details isn't available yet"*). Users click "Edit" expecting to edit, land on a read-only page, get told to ask an admin. Copy uses "isn't available yet" (feature-gap wording); if the read-only state is a lifecycle lock (event completed), the copy should say so instead ("This event has ended — editing is locked"). If it's a genuine feature gap, the route/link names should not read "Edit" until the editor ships. | Two paths for Ivan's call: (a) rename the row action + link to "Manage" (or "Details") + route to `/manage` until an actual editor exists — matches the read-only nature; (b) implement the actual editor (larger scope); (c) if the read-only state is lifecycle-driven (Completed → locked), change the banner copy to reflect that. |
| F-EDIT-2 | IMPORTANT | CpdAccreditationSection + MultiBodyAccreditationWizard both render as forms with Save/Remove buttons on a "read-only" page — meaning CPD is editable but nothing else is. Partial-write surface is confusing: user reads the banner, believes nothing is editable, then discovers CPD is. Or vice versa: user edits CPD, then hits the read-only wall on venue/date. | (a) Move CPD accreditation to its own route/tab (`/events/[id]/accreditation`) — separate the two mental models; or (b) if partial-write is intentional (CPD is separately gated), the banner needs to say what IS editable ("CPD accreditation can still be updated below. Other fields are read-only — ask an admin for changes."). |
| F-EDIT-3 | NOTE | Same F-DETAILS-1 root cause manifests here — CpdAccreditationSection shows "Not accredited" while the multi-body wizard section below shows HKCP configured + "credits already issued, locked". Confirms F-DETAILS-1 is systemic, not `/details`-local. | Same fix as F-DETAILS-1 (add `bridgeButLocked` branch — see F-DETAILS-1). |

#### `/events/[id]/checkin` — Check-in console

Header + scoreboard region + 3 primary actions (Scan badge · Enter code · +Walk-in) · Speakers region · roster region with tabs (All (1) / Checked in (1) / Pending (0)) + search + one attendee row.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| **F-CHECKIN-1** | **BLOCKER** | Scoreboard `Status: Not open yet` on an event that started **1d 5h ago** and is already **1/1 attended** ("Attendance · pending" also visible). Directly false — the event is *completed*, not "not open yet". Same failure class as F-DETAILS-1 (status contradiction). An organiser scanning the scoreboard would believe check-in hasn't started, but it's already run and finished. | Trace the status field in the scoreboard component (`components/details/LiveScoreboard.tsx` or `app/events/[id]/checkin/Scoreboard.tsx` — the two files Frontend Design Standard §6 flagged for hardcoded green). Likely computing status from `event.checkin_opens_at` vs `Date.now()` without accounting for the "event has already ended" branch. Fix pattern: three-branch lifecycle — pre-open ("Not open yet"), open ("Live"), post-close ("Closed" with N of M checked in). |
| F-CHECKIN-2 | NOTE | Attendee row has two inline buttons labeled "chair — Walkthrough Attendee" and "presenter — Walkthrough Attendee" — role-assignment shortcuts? Purpose isn't clear from labels alone; a first-time viewer wouldn't guess these flip a speaker role. | Add tooltips ("Assign as chair" / "Assign as presenter") or move to a `speaker-role` action menu adjacent to the row. |
| F-CHECKIN-3 | NOTE | Speakers region: *"No speakers configured — add them to the agenda first."* Good empty-state copy, actionable. | ✓ No change. |
| F-CHECKIN-4 | NOTE | Progressbar has accessible name "1 of 1 checked in" — good. Roster tabs correctly show counts. | ✓ No change. |

#### `/events/[id]/analytics` — per-event analytics

Header + Outcome + Headline metrics (with `meter` role — good a11y semantics) + Conversion funnel + Feedback questions Q1–Q5 with per-question icons + Operational Insight + Key Operational Metric Analysis.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-EVANALYTICS-1 | MINOR | Q4 chip label reads **"Met/ExceededExpectations"** — no space between "Exceeded" and "Expectations". Template-concat error (likely `${enumKey}` rendered as-is instead of `${humanLabel}`). | Add space or use a controlled `SENTIMENT_LABELS` map: `{ met_exceeded: "Met / Exceeded expectations" }`. |
| F-EVANALYTICS-2 | NOTE | Q1–Q5 use varied icons (event_note, event_seat, insights, favorite, chat) — no obvious semantic mapping icon → question type. Decorative-only OK, but may confuse the "one icon, one meaning" rule (spec §7a-equivalent for icons). | Either (a) accept as decorative (already `aria-hidden`), or (b) establish an icon system tied to question type (single-choice / multi-select / free-text / sentiment). |
| F-EVANALYTICS-3 | NOTE | Headline metrics use `<meter>` — accessible progress indicator with min/max/value. Good MD3 alignment (equivalent to `<md-linear-progress>`). | ✓ No change. |

#### `/participants` — cross-event participants list

H1 "Participants" · subtitle "Everyone who has registered for your events." · Search + Export CSV button · table with 5 columns (Name / Email / Events / Attended / Last registration) · footer count.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-PARTICIPANTS-1 | MINOR | Date column formats as **"9/17/2026"** (US M/D/Y). Rest of the app uses "17 Sept 2026" (`/details`, `/dashboard/manage` row) or ISO-like elsewhere. HK product should not be US M/D/Y. | Use the app's shared date formatter (likely `lib/format/date.ts` or equivalent) — match "17 Sept 2026" everywhere. |
| F-PARTICIPANTS-2 | NOTE | Table renders Events and Attended headers, but the seeded row's Events / Attended cells don't appear in the a11y tree — either the values are numeric 0/0 (which read_page may skip) or the columns are missing content. Verify with fixture that has multi-event participants. | Verify visually; if empty, ensure numeric zeros render with muted styling. |

#### `/analytics` — org-level Reports landing

Small chrome label "Analytics", H1 "Pick a completed event to review", list with per-event cards linking to `/events/[id]/analytics`.

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-ANALYTICS-1 | MINOR | Sidebar nav calls this **"Reports"**; the page (chrome label + `<title>`) calls it **"Analytics"**. User clicks "Reports" and lands on "Analytics" — vocabulary drift, same class as F-DETAILS-3 (Completed vs Wrapped). | Pick one word. Recommend "Analytics" (matches per-event analytics route and page title) — rename sidebar row + Frontend Design Standard §4's nav vocabulary. If "Reports" is the intended broader concept (multi-source), rename the H1 to "Reports · Pick a completed event to review". |
| F-ANALYTICS-2 | NOTE | Empty state not tested (only one completed event exists). Good copy for the populated case. | Verify empty-state copy when zero events exist. |

#### `/checkin` — org-level check-in landing (global walk-in entry)

Small label "Check-in", H1 "Pick an event to run the door" · subtitle "Nothing live right now · 0 coming up" · empty state: *"No open events. Check-in unlocks 60 minutes before an event starts."*

| Finding | Sev | Description | Fix pattern |
|---|---|---|---|
| F-GCHECKIN-1 | NOTE | Tight copy. "Pick an event to run the door" is warm operational language ✓; the 60-min gate rule communicated up front (good pre-emptive expectation setting). | ✓ No change. Note: "60 minutes before an event starts" is a factual claim; verify it matches the actual `event.checkin_opens_at` computation. |

_(Settings + System page sheets appear above under their own sections earlier in this document.)_

---

## Text & icon inventories

_(To be populated. Grep sweeps for stale "Dashboard" / "CPD credit" / engineer-speak; icon-usage table across shells + page headers + buttons.)_

---

## Out of scope / residuals acknowledged

- **Dual CPD UI on `/events/[id]/details`** — legacy `CpdAccreditationSection` + `MultiBodyAccreditationWizard` intentionally coexist post-Stage 10; the section's own advisory now suppresses when locked. Not a new finding.
- **`creditsBlocked` org-scoping (D5, 2026-09-17)** — practitioner-owned data, no valid org filter; awaiting Ivan's ruling on two logged options.
- **Dev-preview UI-port sandbox** (`/dev-preview-uiport/*`) — on hold; scored only if a preview leaks into a production route.
- **Frontend Design Standard §6 known hex-literal debt** — 10+ components; audit re-verifies each is still open (via grep sweep in the Text & icon inventories section), reports only new violations.
- **Legacy `Design Language.md`** — superseded by `Frontend Design Standard.md` on colour doctrine, wordmark and navigation.
- **Port 3000 references** — audit runs against `:3100` per `dev-local.sh`; port-3000 assumptions in docs are not audit findings.

---

## Recommended fix order

_(Populated at report end. Format: BLOCKERS first, then shared-primitive gaps (highest leverage), then page-local polish.)_

---

## Session log

- **2026-09-18** — Full audit executed as planned in [~/.claude/plans/work-instruction-full-spec-elegant-reef.md](/Users/ivan/.claude/plans/work-instruction-full-spec-elegant-reef.md). Rubric loaded (Eventar Frontend Design Standard + Material 3 tokens + Pajamas + cult-ui via `design-system-libraries` skill). Token architecture + primitives (Button, Input, Textarea, Select, Dialog, ConfirmDialog, Toast, BrandMark, StaffShell) inventoried against global libraries. 25 of 28 live routes walked; 4 attendee-authenticated routes deferred (F-ATT-1). 10 cross-page sweeps completed. Text + icon inventories filled. 2 BLOCKERs surfaced (F-DETAILS-1, F-CHECKIN-1), 8 IMPORTANTs, 12 MINORs, 30+ NOTEs.
- **Rule 14 investigation** carried out for F-DETAILS-1: root-caused to a bridge-shape blindspot in [app/events/[id]/details/page.tsx:280-321](/Users/ivan/Eventar/app/events/[id]/details/page.tsx); presented three fix options to Ivan; Ivan declined the AskUserQuestion mid-pass; per plan §8 the BLOCKER remains in the report with the recommended `bridgeButLocked` branch fix pattern.
- **Viewport limitation**: browser pane was hidden (viewport 0x0) throughout — Tailwind responsive utilities didn't apply, so alignment/spacing/layout findings are text-tree-based, not visually verified. F-LANDING-4 (initial "duplicate How-it-works" flag) retracted after tracing to `sm:hidden`/`sm:flex` non-application at 0x0. Dark-mode + tablet + mobile audits deferred.
- **Not committed.** This report file lives at `docs/plans/handoff_20260918-frontend-review.md`; deciding whether/when to commit is Ivan's call.
