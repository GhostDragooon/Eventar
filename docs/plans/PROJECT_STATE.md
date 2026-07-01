# Project State — Eventar
_Last updated: 2026-07-01 (MVP email gaps closed — Email #2 reminder/pass + Email #3 survey invite shipped in code; see `docs/plans/handoff_01072026.md`)_

> Source of truth for "what's active vs forward-looking."
> **Read this BEFORE writing any code.** Updated at the end of each phase.
> Vault decisions live at `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`.

---

## ACTIVE PHASE — Phase 8 — Vercel deploy

**Goal.** Deploy Eventar to Vercel against the production Supabase project. First public URL; first real email infrastructure exercised end-to-end. Operational work primarily, not code.

**Active surface (operational + minimal code):**
- Vercel project creation; link to GitHub repo `GhostDragooon/Eventar`.
- Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (set to canonical Vercel URL or custom domain), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Domain verification on Resend before first prod registration (otherwise sandbox sender `onboarding@resend.dev` is fine but recipient sees it).
- Remove `lib/devEmailStub.ts` per `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol" once `RESEND_API_KEY` is in `.env.local` AND a local smoke registration confirms the real Resend path works.

**Active discipline:**
- CLAUDE.md hard rule 7 (no premature externals) — Vercel is now the canonical deploy, but pg_cron still waits for Phase 9.
- All Phase-8 deploy gates are CLOSED (see CARRIED-FORWARD below).
- Redesign visual contract is locked in `docs/plans/eventar-design-patterns.md` §1–§12 + token tables. No further mockup iteration before deploy.

---

## JUST SHIPPED — Redesign + 7-gap closure phase (2026-06-11 → 2026-06-15)

The 13-surface redesign and 7 frontend↔backend gap-closure tasks shipped end-to-end across ~25 commits. Phase covered the executable plan `docs/plans/2026-06-11-redesign-implementation.md` Tasks 0 → H.3, dispatched via `superpowers:subagent-driven-development` (implementer → spec reviewer → quality reviewer per task; controller commits).

**Deliverables:**
- **Visual foundation (A.1–A.3):** Geist + Geist Mono swapped in via `next/font/google`; Vercel-canonical palette in `app/globals.css` with `prefers-color-scheme: dark`; §7a one-color-one-meaning sweep (green = "Live", accent = "active", amber = "Draft", red = "error", neutrals = "off / done / locked").
- **Lifecycle (B.1):** `live` state starts at `start − CHECKIN_OPEN_MINUTES` (G11). Registration-window also enforced server-side in `registerForEvent` (3-layer gap closed).
- **Data migrations (C.1–C.3):** Q3 4th option `event_format`; Q2 free-text → session multiple-choice (`valuable_block_id` FK + `valuable_overall` bool, `key_highlights` dropped); `speaker_checkins` table + RLS.
- **Editor (D.1–D.3):** `update_event_with_blocks` RPC (owner-gated, atomic); `updateEvent` action; shared `NewEventForm` for create+edit with numbered sections + "Save & Preview".
- **Staff surfaces (E.1–E.5):** 3-part NAV bar (patterns §8); DB band redesign + greeting fallback; ED with sent-wording + session-leader stat; TC scoreboard countdown to start + scan+manual row + speakers card; AN with ring gauges + funnel + Q2 distribution + Q4 stacked bar.
- **Public surfaces (F.1–F.3):** LG + PE + PR restyles; CI restyle to Option A flow + rate limiting; SV all-MC chip-grid form with §7a + §11 + §12 compliance.
- **Email + poster (G.1–G.2):** Confirmation email rebuilt to email-safe HTML (Geist fallback chains, Vercel-canonical palette, sunny-amber RC-B `#FFFBEB/#FED7AA/#92400E/#7C2D12`, bulletproof CTA, first-name greeting per G9); poster redesigned with `--po-*` light-always tokens, accent black band + white QR card top-right, divided info strip, 3-up speaker cards with initials avatars, dot-grid + corner brackets, real event URL (G7), no "Free ·" (G12).
- **Cleanup (H.1):** 6 mockup scratch files removed from `public/`.
- **Phase-completion protocol (H.2):** dev-perspective + user-perspective subagent reviews (separate agents) + backtest against real Supabase + curl :3000. One Important finding (survey error alert below button) fixed in `b64eddc`.

**Test count:** 180 → 390 (+210 tests across 18 new test files).

**Detailed handoffs:** `docs/plans/handoff_11062026.md` (Phases 0–C.2 mid-flight) + `docs/plans/handoff_15062026.md` (final close-out, this phase's H.3 deliverable).

**Architectural patterns codified:**
- **Backend-risk-first task ordering** — token/font foundation before lifecycle semantics before migrations before editor before surface restyles before email. Cheap rework cost when later tasks force earlier reconsideration.
- **§7a one-color-one-meaning** as the cross-page invariant. Every chromatic Tailwind utility (`bg-green-*` etc.) is forbidden outside the documented exceptions (`emails/confirmation.tsx` RC-B amber, `poster/page.tsx` `--po-*` light-always tokens).
- **Light-always tokens inline-scoped to a route** via `<style>{`.po-root { ... }`}</style>` — sidesteps the global `prefers-color-scheme: dark` cascade entirely. Right pattern for any print or fixed-theme surface.
- **Subagent-driven development with two-stage review** — spec compliance first, code quality second. Catches over/under-building before quality nits start firing. Limitation found this phase: dispatches scoped to a 25-commit phase hit API timeouts; scope to the most-recently-shipped surfaces and trust earlier ship-time reviews.

---

## CARRIED-FORWARD CONSIDERATIONS

Things to hold in mind during the ACTIVE build, **NOT to act on now**:

- **Phase-8 deploy gates** — **all 4 closed** (R1 security batch + M1 drift reconcile):
  1. ✅ **CLOSED** — PII enumeration oracle on `/checkin/confirm`: name dropped + rate-limited (commits `7c5bcbd` + `20ac68f`).
  2. ✅ **CLOSED** — `Math.random` → `crypto.randomInt`; codes widened 4→6 chars (commit `659eee0`).
  3. ✅ **CLOSED** — Host-header spoofing: `lib/origin.ts::getRequestOrigin` reads `NEXT_PUBLIC_SITE_URL` first (commit `561d2cb`).
  4. ⚠️ **REGRESSED** — Migration history drift is back. Remote has 2 migrations with NO local file (`20260616112718_add_event_hosts_and_organizers`, `20260616114424_add_event_hero_image`, applied via MCP during the redesign phase). Backfill local migration files before Phase 8 `db push`. See `docs/plans/handoff_01072026.md` ⚠️ section. (The 2026-07-01 `email_log_dedup_idx` migration is itself drift-free — file + remote history match.)
- **MVP email gaps CLOSED (2026-07-01)** — Email #2 (reminder/pass w/ personal CID QR) + Email #3 (survey invite) shipped as templates + `sendReminderForEvent`/`sendSurveyInviteForEvent` Server Actions, landing on `devEmailStub`. These are the exact units Phase 9's pg_cron jobs will call. **Phase-9 caveat:** a `queued` reminder/survey `email_log` row is terminal under the new `email_log_dedup_idx` — cron reconciliation must not treat `queued` as "needs sending."
- **devEmailStub removal protocol** — now spans **THREE** call sites (`registerForEvent` + the two new email actions). Once `RESEND_API_KEY` is set AND a smoke registration confirms the real path, remove the temp per `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol" (update that doc for the added `emailActions.ts` env-switch). Until then, ALL sends log to console — no real email.
- **Phase 9 (pg_cron)** will read `email_log` — do NOT rename the `purpose` enum values (`confirmation`, `reminder`, `survey`).
- **Three-layer validation** (form → Zod → DB constraint) for every new mutation.
- **`requireStaff()` at top of every staff Server Action** — hard rule.
- **Q18 patterns** (RLS-silent-fail + revalidatePath) — required for every mutation Server Action.
- **Rate-limit any new public Server Action / GET endpoint** via `lib/rateLimit.ts::rateLimitByIp`. Existing limits: selfCheckIn/submitSurvey 10/min/IP · registerForEvent 30/min/IP · GET /checkin/confirm + /survey 60/min/IP.
- **`NEXT_PUBLIC_SITE_URL`** must be set in Vercel env before Phase 8 deploy. `lib/origin.ts` throws in production if missing.
- **Owner-only by default for mutation surfaces** (Q19, 2026-06-02). New mutation pages gate at page entry via `event.created_by !== staff.id` redirect; new mutation actions use `supabaseServer()` so RLS enforces. `supabaseAdmin()` only for documented exceptions (public anon flows).
- **`@react-email/components` → `@react-email/ui` migration** — small follow-up post-Phase-8 once the `emails/confirmation.tsx` template is iterating. Single import-path change (or possibly a small JSX rewrite depending on API drift). Not blocking.

---

## EXPLICITLY OUT OF SCOPE FOR THE ACTIVE PHASE

Intentionally NOT in Phase 8 — surface as "for later" if they come up in conversation:

- **Real edit form** for events. `/edit` remains read-only + Publish for owners only (Q19).
- **`/api/*` routes.** Server Actions remain the in-app public-write surface. `/api/*` reserved for Phase 9 cron callbacks.
- **Manager-specific UI.** RLS scopes visibility; no role-branching per Q16 Decision B.
- **Email #2 reminder + Email #3 survey-invite sends.** Wait for Phase 9 (pg_cron).
- **Phase 9 cron infrastructure.** That's its own phase.
- **Queued-row backlog sweep.** Per user direction during Phase 7 brainstorm: don't worry about transient stub-era rows.

---

## Open decisions

_(none currently. Phase 8 work is operational; ask the user before adding non-deployment scope.)_

---

## Phase ledger (compressed)

| Phase | Status | Demoable end-state |
|---|---|---|
| 1 / 1.5 / 1.5b | ✅ shipped | Magic-link login → create draft event (accordion form) → public `/events/:id` after publish |
| 2 | ✅ shipped | Anonymous registration (inline on info page) → DB row + email_log stub |
| 3 / 3.5 | ✅ shipped | Publish action; one QR per event; poster page; CSV registrant export |
| 4 / 4.6 | ✅ shipped | Tablet roster with Realtime + html5-qrcode scanner; `/checkin/confirm?code=` self-checkin; M3 indigo design system |
| 5 | ✅ shipped | `/survey?code=` 5-question categorical template (Q15 schema) |
| 6 | ✅ shipped | Per-event `/analytics` (categorical distributions, no avg ratings — Q16) |
| 6.5 | ✅ shipped | Dashboard redesign + per-event `/details` with 5-state lifecycle (Q17) |
| 7 | ✅ shipped (code) | Real Resend infrastructure + React Email template for Email #1 — credentials pending in `.env.local` |
| Redesign + gaps | ✅ shipped | 13-surface Vercel-canonical + Geist redesign · 7 frontend↔backend gaps closed (Q3 4-option, Q2 session MC, speaker check-in, real edit form, live-ops lifecycle, sent-wording, real poster URL) · vitest 180 → 390 |
| **8** | **active** | Vercel deploy; env vars + Resend domain verified; first real email out the door |
| MVP email gaps | ✅ shipped (code) | Email #2 reminder/pass (personal CID QR) + Email #3 survey invite: templates + `sendReminderForEvent`/`sendSurveyInviteForEvent` actions + `email_log_dedup_idx` idempotency · on devEmailStub · vitest 390 → 436 |
| 9 | planned | pg_cron *calls the already-built* `sendReminderForEvent` (60-min) + `sendSurveyInviteForEvent` (10-min-after) actions; retry/reconciliation + the `queued`-is-terminal caveat |

---

## How to keep this current

- The phase that just shipped updates this doc as part of its `docs/plans/handoff_DDMMYYYY.md` close-out.
- "ACTIVE PHASE" rotates to the next phase's design plan.
- "JUST SHIPPED" rotates to what was previously ACTIVE.
- "CARRIED-FORWARD CONSIDERATIONS" gets new items appended; resolved items removed.
- If this file's `Last updated` is more than one phase out of date, treat it as stale and prefer the latest handoff doc in `docs/plans/`.
