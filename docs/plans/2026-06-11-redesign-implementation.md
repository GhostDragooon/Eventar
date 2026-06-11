# Eventar Redesign + Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Read `/Users/ivan/Eventar/CLAUDE.md` and `docs/plans/PROJECT_STATE.md` BEFORE starting.
> The visual spec is `docs/plans/eventar-design-patterns.md` (locked patterns §1–§12 + token tables) and `docs/plans/handoff_05062026.md`. The gap decisions are in `docs/plans/2026-06-10-design-implementation-gaps.md`.

**Goal:** Apply the locked Geist + Vercel-canonical redesign to all 13 surfaces and close the 7 frontend↔backend gaps (survey all-MC, Q3 4th option, speaker check-in, real edit form, live-ops lifecycle, sent-wording, poster URL).

**Architecture:** Backend-risk-first ordering — token/font foundation, then lifecycle semantics, then the three migrations + their actions, then the editor, then surface-by-surface restyles, email last. Token NAMES stay intact (values swap), so restyles are mostly markup-level. Every task ends with the project gates: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` not middleware), Tailwind v4 (`@theme inline`), Supabase (RLS + SECURITY DEFINER RPCs), React Email + Resend, Vitest + RTL (no `globals:true` — tests need explicit `afterEach(cleanup)`).

**Hard rules in force (from CLAUDE.md):** `requireStaff()` top of every staff action · three-layer validation (form → Zod → DB constraint) · email_log INSERT before send · no PII in logs · owner-only mutations (Q19) · RLS-silent-fail + revalidatePath (Q18) · rate-limit public surfaces · convention over novelty.

**Current baselines:** vitest 180/180 across 27 files · next build 14 routes · eslint 0 errors/5 warnings (devEmailStub — leave alone, Phase 7 protocol owns it).

---

## Phase 0 — Baseline

### Task 0.1: Commit the design docs + verify gates

**Files:**
- Commit: `docs/plans/eventar-design-patterns.md`, `docs/plans/handoff_05062026.md`, `docs/plans/2026-06-10-design-implementation-gaps.md`, this plan.

**Step 1:** Run the gates; confirm 180/180, build exit 0.
```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```
**Step 2:** Commit docs only (NOT `public/*.html` scratch files):
```bash
git add docs/plans/eventar-design-patterns.md docs/plans/handoff_05062026.md docs/plans/2026-06-10-design-implementation-gaps.md docs/plans/2026-06-11-redesign-implementation.md
git commit -m "docs(design): lock 13-surface mockup phase — patterns, gaps, implementation plan"
```

---

## Phase A — Visual foundation (fonts + palette + dark mode)

### Task A.1: Font swap → Geist + Geist Mono

**Files:**
- Modify: `app/layout.tsx`

**Step 1:** Read `app/layout.tsx` and `node_modules/next/dist/docs/` for the Next 16 `next/font/google` API (AGENTS.md warning — verify against docs, not training data).

**Step 2:** Replace `Inter` + `Source_Serif_4` imports with Geist, **aliasing the existing CSS variable names** so all `font-headline-*` Tailwind utilities keep working with zero downstream edits:

```tsx
import { Geist, Geist_Mono } from 'next/font/google';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',           // alias: body font var now resolves to Geist
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-source-serif',    // alias: headline font var now resolves to Geist Mono? NO —
});
```

⚠️ **Check before coding:** the handoff says alias both old vars to Geist (sans). Geist Mono is for code/numeric surfaces only. Read `globals.css` to see which var feeds `font-headline-*`; headline must be **Geist sans**, not mono. If `--font-source-serif` feeds headlines, alias it to `geist` (sans) and introduce a NEW `--font-geist-mono` var for mono usage. Surface any ambiguity rather than guessing (Rule 1).

**Step 3:** Gates. Visual smoke on `http://localhost:3000/dashboard` (user's dev server — NEVER start your own): headings render Geist.

**Step 4:** Commit: `feat(design): swap Inter+SourceSerif → Geist family (vars aliased)`

### Task A.2: Palette swap + dark mode in globals.css

**Files:**
- Modify: `app/globals.css`

**Step 1:** Read `globals.css`. Map every M3-indigo token VALUE to Vercel canonical per this table (token NAMES unchanged):

| Token role | Light | Dark |
|---|---|---|
| bg | `#FFFFFF` | `#000000` |
| surface | `#FFFFFF` | `#0A0A0A` |
| surface-container | `#FAFAFA` | `#171717` |
| surface-container-high(est) | `#F4F4F5` | `#262626` |
| primary | `#0A0A0A` | `#FFFFFF` |
| on-primary | `#FFFFFF` | `#0A0A0A` |
| accent / tertiary | `#0070F3` | `#3291FF` |
| on-surface (fg) | `#0A0A0A` | `#FAFAFA` |
| on-surface-variant (fg-muted) | `#525252` | `#A1A1AA` |
| outline-variant (border) | `#EAEAEA` | `#262626` |
| outline | `#8F8F8F` | `#525252` |
| success | `#16A34A` | `#4ADE80` |
| warning | `#D97706` | `#FCD34D` |
| danger/error | `#DC2626` | `#F87171` |

**Step 2:** Add the dark block (system-default only, NO toggle):
```css
@media (prefers-color-scheme: dark) {
  :root { /* dark values for the same custom properties */ }
}
```
Tailwind v4 `@theme inline` reads the custom properties, so only `:root` + the media block change.

**Step 3:** Gates + visual smoke both schemes (macOS System Settings → Appearance, or DevTools emulation). Check `/dashboard`, `/events/[id]` public page, `/login`.

**Step 4:** Commit: `feat(design): Vercel-canonical palette + prefers-color-scheme dark mode`

### Task A.3: Color-system sweep utilities

**Files:**
- Modify: `app/globals.css` (if pill/status classes live there) or `components/lifecycle/StatusPill.tsx`

**Step 1:** Apply patterns doc §7a: green ONLY for live · amber translucent for draft · neutrals for done/locked/upcoming · accent for registering/focus. Read `StatusPill.tsx` and update its class map.

**Step 2:** Gates. Commit: `feat(design): one-color-one-meaning status system (patterns §7a)`

---

## Phase B — Lifecycle semantics (G11)

### Task B.1: `live` starts at check-in open (start − 60 min)

**Files:**
- Modify: `lib/lifecycle/eventLifecycle.ts`
- Test: existing lifecycle test file (find via `grep -r "computeLifecycle" --include="*.test.ts"`)

**Step 1:** Write failing tests:
```ts
const CHECKIN_OPEN_MS = 60 * 60 * 1000;
// published event, now = start - 30min  → 'live'   (was 'upcoming')
// published event, now = start - 61min  → 'upcoming'
// published event, now = end - 1s       → 'live'   (unchanged)
// published event, now = end + 1s       → 'completed' (unchanged)
```
**Step 2:** Run → FAIL (boundary cases). 
**Step 3:** Implement: export `CHECKIN_OPEN_MINUTES = 60`; in `computeLifecycle`, the `live` lower bound becomes `start_time - CHECKIN_OPEN_MINUTES * 60_000`.
**Step 4:** Run lifecycle tests → PASS. Run FULL vitest — dashboard/details/checkin tests may assert old boundaries; fix any that encode "upcoming until start_time" (they're testing the changed contract, update them deliberately, not blindly).
**Step 5:** Grep for other consumers: `grep -rn "lifecycle === 'live'\|lifecycle === 'upcoming'" app components lib` — verify each still makes sense when "live" includes the pre-start hour (e.g. ED Section B copy, TC access).
**Step 6:** Gates. Commit: `feat(lifecycle): live = ops window (check-in open → end) — G11`

---

## Phase C — Migrations + survey data model (G1, G2, G3)

> Apply each via `supabase db push` (drift was reconciled 2026-06-02; if push refuses, STOP and surface — do not force). Backtest each in the Dashboard SQL editor per project CLAUDE.md.

### Task C.1: Migration — Q3 4th option (G2)

**Files:**
- Create: `supabase/migrations/20260611_survey_value_prop_4th_option.sql`
- Modify: `lib/surveyTemplate.ts`, `app/(public)/survey/schema.ts`

**Step 1:** Migration:
```sql
alter table public.survey_responses drop constraint survey_value_proposition_ck;
alter table public.survey_responses add constraint survey_value_proposition_ck check (
  value_proposition is null or value_proposition in
    ('clinical_application','faculty_caliber','peer_collaboration','event_format'));
```
**Step 2:** `surveyTemplate.ts`: add `'event_format'` to `VALUE_PROPOSITION_VALUES` and `{ value: 'event_format', label: 'Event format and organisation' }` to options. Zod enum updates automatically if derived from the const; verify.
**Step 3:** Failing test first in the schema test file: submitting `value_proposition: 'event_format'` validates. Run → fails → apply changes → passes.
**Step 4:** `supabase db push`. Backtest: SQL editor `insert … value_proposition='event_format'` on a scratch row → succeeds; `'bogus'` → constraint violation.
**Step 5:** Gates. Commit: `feat(survey): 4th value-proposition option (G2)`

### Task C.2: Migration — Q2 free-text → session MC (G1)

**Files:**
- Create: `supabase/migrations/20260611_survey_q2_session_mc.sql`
- Modify: `lib/surveyTemplate.ts`, `app/(public)/survey/schema.ts`, `app/(public)/survey/actions.ts`, `app/(public)/survey/SurveyForm.tsx`, `app/(public)/survey/page.tsx`

**Step 1:** Migration (no prod data — drop is clean):
```sql
alter table public.survey_responses
  add column valuable_block_id uuid null references public.agenda_blocks(id) on delete set null,
  add column valuable_overall  boolean not null default false;
alter table public.survey_responses drop column key_highlights;
-- key_highlights len CHECK drops with the column
comment on column public.survey_responses.valuable_block_id is
  'Q2: most valuable session. NULL + valuable_overall=false → unanswered; NULL + true → "General sessions / overall".';
```
**Step 2:** Zod: replace `key_highlights` with `valuable_session: z.union([z.string().uuid(), z.literal('general')]).optional()`.
**Step 3:** Action (TDD): failing tests —
- block id belonging to another event → rejected (server-side check: fetch block, compare `event_id`);
- `'general'` → row written with `valuable_overall=true, valuable_block_id=null`;
- valid block id → written.
Then implement. Keep the admin-client + code-as-bearer-token pattern; keep the 10/min/IP rate limit.
**Step 4:** `page.tsx`: fetch the event's agenda blocks (id, title, first topic's speaker_name) and pass as Q2 options; fall back to only-"general" when no blocks.
**Step 5:** `SurveyForm.tsx`: replace textarea with `chip-stack` single-select (patterns §11); options labeled `"{title} · {speaker}"` + "General sessions / overall". One-line intro (locked copy §12): `Thank you for attending, {first_name}—please complete five quick questions (under 3 minutes).` Add `afterEach(cleanup)` in any new component test.
**Step 6:** Remove `KEY_HIGHLIGHTS_MAX`; grep for stragglers: `grep -rn "key_highlights\|KEY_HIGHLIGHTS" app lib emails` — `app/events/[id]/details/page.tsx` and `analytics/page.tsx` WILL hit (fixed properly in Phases E/F — for now make tsc pass by removing the dead reads, leave a `// Phase E rework` marker only if unavoidable).
**Step 7:** db push + backtest (insert via SQL editor with real block id → ok; cross-event block id via action → rejected).
**Step 8:** Gates. Commit: `feat(survey): Q2 session multiple-choice from schedule, drop free text (G1)`

### Task C.3: Migration + actions — speaker check-in (G3)

**Files:**
- Create: `supabase/migrations/20260611_speaker_checkins.sql`
- Create: `app/events/[id]/checkin/speakerActions.ts`
- Test: `app/events/[id]/checkin/speakerActions.test.ts`

**Step 1:** Migration:
```sql
create table public.speaker_checkins (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  speaker_name  text not null check (char_length(speaker_name) between 1 and 120),
  checked_in_at timestamptz,
  updated_by    uuid references public.staff(id),
  unique (event_id, speaker_name)
);
alter table public.speaker_checkins enable row level security;
-- Mirror the registrations staff policies: owner read/write (Q19), manager read.
-- Copy the exact policy shape from 20260523010000_init_checkin_columns.sql / registrations policies.
```
Speakers are NOT a table — names derive at render time from `agenda_blocks` (block `host` + topic `speaker_name`s, deduped). The unique key is `(event_id, speaker_name)`.

**Step 2:** Action TDD — `toggleSpeakerCheckin(eventId, speakerName)`:
- `requireStaff()` first line; owner-only (supabaseServer → RLS enforces, Q18 silent-fail check);
- name must match a speaker derived from the event's agenda blocks (server-side recompute — reject arbitrary names);
- upsert: no row/`checked_in_at null` → set `now()`; set → clear (toggle);
- `revalidatePath('/events/[id]/checkin')` + `/details`.
Write failing tests (mock supabase per existing action tests' pattern), implement, pass.
**Step 3:** db push + backtest: toggle on a real event via action → row appears in SQL editor; toggle again → `checked_in_at` null.
**Step 4:** Gates. Commit: `feat(checkin): speaker/host check-in tracking (G3)`

---

## Phase D — Real event editor (G4)

> The single biggest task. The mockup spec is the EE stepper (handoff + this session). Reuse, don't fork: `NewEventForm.tsx` generalizes into one form used by both routes.

### Task D.1: RPC — `update_event_with_blocks`

**Files:**
- Create: `supabase/migrations/20260611_rpc_update_event_with_blocks.sql`

Mirror `20260516105109_rpc_create_event_with_blocks.sql` (read it first — same SECURITY DEFINER + `current_staff_id()` + pinned `search_path` shape):
```sql
-- update events row (owner check: created_by = current_staff_id(), else raise);
-- delete + reinsert agenda_blocks for the event (atomic, in-function);
-- survey_responses.valuable_block_id is ON DELETE SET NULL — acceptable:
-- surveys exist only post-event, edits matter pre-event. Documented trade-off.
```
TDD at the SQL level isn't practical here; backtest in SQL editor: update title + replace blocks on a draft event → verify rows; attempt as non-owner staff → exception.
db push. Commit: `feat(db): update_event_with_blocks RPC (owner-gated, atomic)`

### Task D.2: `updateEvent` Server Action

**Files:**
- Create: `app/events/[id]/edit/updateAction.ts` (or extend `edit/actions.ts`)
- Test: colocated `.test.ts`

TDD: reuse `eventInputSchema` + `blockInputSchema` from `app/events/new/schema.ts` (DRY — import, don't copy). Failing tests: invalid payload → field errors; valid → RPC called; non-owner → error surfaced (Rule 12, no silent success). `requireStaff()` first line. Timezone: recompute via `tzFromCoords` when coordinates changed. revalidatePath both `/events/[id]` and `/edit` and `/details`. Commit: `feat(events): updateEvent action wired to RPC (G4)`

### Task D.3: Generalize the form + stepper restyle

**Files:**
- Modify: `app/events/new/NewEventForm.tsx` → accept `mode: 'create' | 'edit'`, `initialEvent?`, `initialBlocks?`, submit handler prop
- Modify: `app/events/new/page.tsx`, `app/events/[id]/edit/page.tsx` (replace read-only view with the form; keep Publish action where lifecycle = draft)
- Modify: `components/event-form/*.tsx` (restyle pass)

Spec deltas from the mockup (this session):
- 4-step stepper medallions (1 Basics · 2 Venue · 3 Date & Time · 4 Schedule[optional]) — restyle of the existing accordion, states: done=neutral-check, active=primary, future=muted (§7a — NO green medallions).
- Field pattern EE-INPUT: bg=page-bg, border, accent focus ring; derived venue fields read-only style; map preview tile (Mapbox static or existing preview if shipped).
- "Event type" label for the block `kind` field (patterns §7 — DB column name unchanged).
- Timezone: NO control; quiet hint "Times shown in {tz} — picked up from your venue" (already true in backend).
- NO autosave indicator (G5 dropped). Action row: Cancel · Save draft · Save & preview.
- Existing component tests: keep passing; new tests need `afterEach(cleanup)`.

Gates after each file. Commits per logical unit, e.g. `feat(events): real edit form — shared stepper for create+edit (G4)`.

---

## Phase E — Staff surfaces restyle (DB, ED, TC, AN)

> Pure restyle + the wording/data fixes. NAV first since all four consume it.

### Task E.1: NAV — 3-part bar in StaffShell

**Files:**
- Modify: `components/shell/StaffShell.tsx` (+ its test)

Per patterns §8: left slot optional back link (`backHref` + `backLabel` props), right slot `email · Sign out`. Remove any old topbar branding (M3). All staff pages pass their back target (DB: none · EE/ED: events root · TC/AN: the event). Commit: `feat(shell): 3-part staff NAV (patterns §8)`

### Task E.2: Dashboard (DB)

- Greeting: `Welcome back{staff.full_name ? ', ' + firstName(staff.full_name) : ''}.` — create `lib/name.ts::firstName` first (TDD: trims, splits on whitespace, handles single token + empty).
- Bands per mockup: Live (green pill — now includes pre-start ops window per B.1) / Draft / Completed; tile = status bar + title + meta + stat line.
- Commit: `feat(dashboard): redesign bands + greeting fallback (G8)`

### Task E.3: Event details (ED)

- Header: pill+title row, meta+toolbar row (toolbar contents UNCHANGED — lifecycle-visibility redesign is parked, see patterns doc "parked" note).
- Sections A/B/C monochrome ladder (§7a): done=neutral, active=accent ring, locked=dim; "Scanning live" indicator moves TOP-LEFT (§9).
- Wording: "58 sent" not "delivered" (G6) — source: `email_log` count where `purpose='confirmation' and status='sent'` for the event.
- Section C: replace "Latest highlight" (dead with G1) with response count + leading session name (join `valuable_block_id → agenda_blocks.title`).
- Commit: `feat(details): redesign + sent-wording + session-leader stat (G6, G1)`

### Task E.4: Tablet check-in (TC)

- Scoreboard: status top-left, Checked-in fraction + bar, **Starts in** countdown (to `start_time`; after start flips to "Started Xm ago") — pure derivation, no schema (G10: "doors" phrase = `start − 60min` or omit).
- Scan square (SVG pictogram, accent scan line) opens the EXISTING html5-qrcode flow (it shipped in Phase 4 — wire the button to it, don't rebuild); manual-entry card beside it → calls existing `markAttended(code, 'manual')`.
- TC-SPEAKERS card: derive speaker list from agenda blocks (host + topic speakers, dedupe), join `speaker_checkins`, toggle via Task C.3 action.
- Roster: restyle existing `RosterClient` (search/filter/Realtime all shipped) — three row states (§ this session: recent=accent fading, checked=muted, default + "Check in →").
- Commit: `feat(checkin): tablet redesign — scoreboard countdown, scan+manual row, speakers card`

### Task E.5: Analytics (AN)

- Headline stats + ring gauges (inline SVG, accent on surface-high track).
- NEW funnel card: registered → attended → responded.
- Q2 distribution "Most valuable session": aggregate `valuable_block_id` (+ overall bucket), label via block title + speaker; delete `HighlightCommentSlice` usage.
- Q4: sentiment strip + 100% stacked bar (sequential accent opacities 1.0/0.7/0.4/0.18) — REPLACES the per-row bars for Q4 (decision from review: stacked bar carries it).
- Winner-row emphasis: top row full accent, rest `--accent` @ 45%.
- Commit: `feat(analytics): redesign — funnel, rings, stacked sentiment, session distribution`

---

## Phase F — Public surfaces restyle (LG, PE, PR, CI, SV)

### Task F.1: Login (LG) + public event page (PE) + post-register state (PR)
Apply locked patterns: 480px container, hero, 2-col event-meta grid (§1), sentence stack (§3), "By Eventar" footer (§2), no top branding (M3). Registration form keeps its three-layer validation untouched — this is restyle only.
Commit per surface.

### Task F.2: Check-in confirm (CI)
Restyle only (Option A flow + rate limiting shipped). Commit.

### Task F.3: Survey (SV)
Form controls: 2×2 chip-grid (radio glyph) for Q1/Q3, chip-stack for Q2, segmented for Q4, checkbox chips for Q5 (multi); `pick one`/`pick any` tags; no dividers (gap rhythm owns spacing); submit + anonymity note. (Data work already done in C.1/C.2 — this is the visual layer.) Commit: `feat(survey): redesigned all-MC form`

---

## Phase G — Email + poster

### Task G.1: Confirmation email rebuild (EM)

**Files:**
- Modify: `emails/confirmation.tsx` (+ its test)
- Modify: caller in `app/events/[id]/.../registerForEvent` action or `lib/resend.ts` — pass `firstName(full_name)` (G9)

Spec = Page 13 mockup: React Email `Section/Row/Column` (renders tables), ALL styles inline, margins not gap (M6), font stacks `'Geist', Helvetica, Arial, sans-serif` / mono fallback chain. Sunny-amber code block (locked RC-B values: `#FEF3C7`/`#FBBF24`/`#D97706`/`#92400E`, label `margin: -10px 0 6px`). Bulletproof CTA (td bg + padded `<a>` — react-email `<Button>` does this; verify rendered HTML). 2-col meta as `<Row><Column>`. Keep props contract otherwise — `lib/resend.ts` and `devEmailStub` flow untouched (Phase 7 removal protocol owns the stub).
TDD: update render tests (subject, code present, no flex/gap in rendered HTML — assert `render()` output contains `<table` and the amber hex).
Commit: `feat(email): email-safe confirmation rebuild — Geist fallbacks, amber code, tables (M6, G9)`

### Task G.2: Poster (PO)

**Files:**
- Modify: `app/(public)/events/[id]/poster/page.tsx`

Spec = Page 12 v2 mockup: `--po-*` light-always tokens (scoped to the poster route, NOT in the dark media block) · accent header band with white QR card top-right (reuse `buildEventQrPng`) · divided info strip · 3-up speaker cards with initials avatars (derive initials from topic speaker names) · dot-grid + corner-shape background · footer prints the REAL event URL from `getRequestOrigin()` (G7 — no short links) · seats line only when `max_attendees` set, no "Free ·" (G12). Keep `print:` utilities discipline (screen chrome hidden in print).
Commit: `feat(poster): redesigned print poster — band, info strip, speaker cards`

---

## Phase H — Cleanup + phase completion protocol

### Task H.1: Delete mockup scratch files
```bash
rm public/preview.html public/design-audit.html public/design-audit-dark.html public/font-mockup.html public/color-mockup.html public/regcode-popped.html
```
Gates. Commit: `chore(design): remove mockup scratch files`

### Task H.2: Mandatory three checks (user-global CLAUDE.md — NO summary docs before these pass)

1. **Dev-perspective review** — dispatch a code-reviewer agent: full diff, gates run independently, project-rule compliance (requireStaff, Q18/Q19, three-layer validation, PII, color-system §7a), React stale-closure check on RosterClient/stepper changes.
2. **User-perspective review** — SEPARATE agent, cold-start journeys: register → email → check-in (manual + QR) → survey (all-MC) → analytics; staff: create → edit (NEW) → publish → live ops (speaker toggle) → completed. Both color schemes. Every error message read in context.
3. **Backtest** — real systems: create+edit event via the real form against real Supabase (verify rows + blocks reconciliation), toggle speaker check-in (query row back), submit survey with session choice (verify `valuable_block_id`), register and verify `email_log` row + stub/real path, hit every public route on :3000.

Fix findings → re-run affected checks.

### Task H.3: Close-out docs (only after H.2 passes)
- Update `docs/plans/PROJECT_STATE.md` (rotate ACTIVE PHASE; record vitest/route counts; note Phase 8 deploy unblocked-pending-design now resolved).
- Write `docs/plans/handoff_DDMMYYYY.md`.
- Vault note per project convention.
- Commit: `docs(handoff): redesign + gap closure shipped`

---

## Execution notes

- **Never start a dev server** — user's `pnpm dev` owns :3000.
- **Subagents cannot commit** (Bash gate) — controller commits their work.
- **If `supabase db push` refuses** (history drift regression), STOP and surface — manual reconcile decision belongs to the user.
- **Vitest count** grows each phase; track the running number in commit bodies (baseline 180).
- Where the plan's code conflicts with what you find in the file, the FILE wins for shape, the PLAN wins for intent — flag conflicts, don't average (Rule 7).
