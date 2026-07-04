# Project State — Eventar
_Last updated: 2026-07-04 (**CPD Sprint 1 shipped** — multi-tenancy + identity + audit-chain foundations; see `docs/plans/handoff_04072026.md`)_

> Source of truth for "what's active vs forward-looking."
> **Read this BEFORE writing any code.** Updated at the end of each phase.
> Vault decisions live at `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`.

---

## ⚠️ PIVOTAL DIRECTION CHANGE — 2026-07-03

Eventar pivoted from internal workshop manager to a **CPD/CME/CE event + credit platform** (HK launch, HKCP first accrediting body). Canonical record + frozen design baseline: vault note `20 — Roadmap/Pivot — CPD Platform (2026-07-03).md` + Decisions Log **Q20** (reverses Q6.3 single-org; supersedes Q5 magic-link-only staff auth).

**Active plan:** vault `20 — Roadmap/CPD Roadmap — Backend First.md` — backend first, **frontend frozen** (no new surfaces, no restyles; existing 18 routes keep working against a default organisation).

**CPD Sprint 0 — hygiene + docs landing: ✅ SHIPPED (2026-07-04).** Login PKCE fix (`65935c7`) · review-mode bypass stripped (`c43fd95`) · migration drift reconciled 26/26 (`8c8e7d9`) · build pack + BASELINE-DELTAS landed (`b5bb5aa`, `669cd68`) · Sprint 1 executable plan written (`4f8b2e4`).

**CPD Sprint 1 — multi-tenancy + identity + audit-chain foundations: ✅ SHIPPED + PHASE-COMPLETION PROTOCOL PASSED (2026-07-04).** Executed end-to-end from `docs/plans/2026-07-04-cpd-sprint-1-foundations.md`, Tasks 0–10 complete (Task 11 Singapore provisioning is next, gated on Ivan — see below). Six migrations applied to the live Seoul project (`muieupgkpbxpqsrjjwol`) via CLI `db push`, plus an env-gated real-DB integration suite. Full retrospective: `docs/plans/handoff_04072026.md`.

| Commit | Migration / file | What it adds |
|---|---|---|
| `a1d6f05` | `20260704130000_init_organisations.sql` | `organisations` table, tenancy root, default-org seed |
| `841d14f` | `20260704130100_init_users_mirror.sql` | `public.users` mirror of `auth.users`, insert trigger, backfill |
| `40032cd` | `20260704130200_staff_org_scope.sql` | `staff.organisation_id` + `status`, `eventar_staff` role, hardened `app_private.*` helpers |
| `3d65ef5` | `20260704130300_events_org_scope.sql` | `events.organisation_id` (default-org adoption) |
| `9bccd1b` | `20260704130400_init_audit_chain.sql` | `audit_events` hash chain, `chain_seq` under advisory lock, insert-only `audit_writer`, `write_audit_event`, `verify_audit_chain` |
| `34aa22a` | `20260704130500_init_consent_dsr.sql` | `consent_records`, `data_subject_requests`, `pseudonymise_user` (in-function staff gate + audit write) |
| `243b76b` | `tests/helpers/*`, `tests/rls/foundations.rls.test.ts`, `tests/audit/chain.test.ts`, `test:rls` script | Real-DB RLS + audit-chain integration suite (17 tests, env-gated) |

**Two real defects found and fixed during execution** (both folded into their migration files before commit, since neither had been committed with the defect present):
1. `ALTER FUNCTION ... OWNER TO audit_writer` requires the target role to hold `CREATE` on the schema at transfer time — added a grant-then-revoke bracket around the ownership transfer.
2. `compute_audit_hash()` isn't `SECURITY DEFINER`, so it runs as `audit_writer` once called from inside `write_audit_event()` — `audit_writer` needed `USAGE` on schema `extensions` + `EXECUTE` on `extensions.digest(text,text)`, which the original migration never granted.

**One test-harness defect found and fixed:** the plan's literal 200-concurrent-`Promise.all` design in `tests/audit/chain.test.ts` overwhelmed the local Node/undici connection layer (158/200 client-side `fetch failed`, zero server-side errors — confirmed via Postgres/API log inspection). Fixed by batching into concurrent chunks of 20 (empirically the reliable ceiling; 30 already showed one failure) — still genuinely exercises the advisory-lock serialization under real overlapping transactions.

**Operational caveat (not a defect):** running `pnpm test:rls` in tight back-to-back succession (multiple full runs within a few minutes) can transiently exhaust local client-side sockets and produce spurious failures unrelated to the code — confirmed via Postgres/API logs showing zero server-side pressure during the affected runs. Run it once per session; if it fails, re-run once after a short pause before assuming a real regression.

**Result:** static gates green (tsc clean · eslint 0 errors, 5 pre-existing unrelated warnings · vitest 438 passed \| 17 skipped · next build unchanged, 18 routes) · `pnpm test:rls` 17/17 · migration list 32/32 two-sided · existing routes backtested (curl 200/200/200, manager reads unchanged at 7 events / 63 registrations) · escalation-denial and tamper-denial regression tests both confirmed blocking (`42501`).

**Phase-completion protocol (Task 10) — PASSED, two separate agents:**
- **Dev-lens review:** PASS. Independently re-verified (queried the live DB directly, did not trust the plan or this handoff) that all four BASELINE-DELTAS defect-fixes are actually present and correct: `chain_seq` overridden inside the trigger under the advisory lock with `chain_seq`-ordering (not `created_at`); `pseudonymise_user`'s staff gate inside the function body; `search_path` pinned on every new SECURITY DEFINER function; `audit_writer`'s live grants confirmed to be exactly SELECT+INSERT on `audit_events` (the transient CREATE grant is confirmed revoked). Zero confirmed defects. `get_advisors` run; findings below.
- **User-lens review:** PASS. Existing app confirmed unaffected (curl `/`, `/login`, `/events` all 200; `/dashboard` correctly 307-redirects unauthenticated — exactly the behaviour expected of an untouched frontend). No information-disclosure leak in `pseudonymise_user`'s or `audit_events`' error paths (staff-gate raises `42501` before any user-existence check is reachable). Two documentation gaps found and fixed here: this handoff doc didn't exist yet when checked (expected — written last, per protocol) and the vault Sprint 1 note's checklist was stale (fixed below).

**Carried forward from the reviews (not fixed now — explicitly tracked, not silently dropped):**
1. **`write_audit_event` has no caller-identity check.** It's a plain `SECURITY DEFINER` RPC grantable to `authenticated` with no verification that `p_actor_role`/`p_actor_user_id` match the calling session — a malicious authenticated user could call it directly via PostgREST and forge a legitimately-chained row with false actor claims. The chain's tamper-*evidence* (Sprint 1's actual goal) is intact and unaffected; audit *authenticity* depends on Sprint 2's `withSecurity` Server Action wrapper being the sole real caller, deriving `actor_user_id`/`actor_role` server-side from the authenticated session, never from client input. **Action for Sprint 2:** either restrict `write_audit_event`'s grant off `authenticated` once the wrapper lands (Server Actions run server-side and can call it via a service/definer path instead), or have the wrapper be the only thing that ever calls it with real actor data and treat direct-RPC forgery as an accepted residual risk documented in the security middleware doc. Needs an explicit decision at Sprint 2 start.
2. **Two Supabase advisor performance WARNs** (not correctness issues, not required by BASELINE-DELTAS or the plan): `multiple_permissive_policies` on `consent_records`/`data_subject_requests`/`users` (self + staff SELECT policies overlap, both evaluated per query) and `auth_rls_initplan` on the same three tables (`auth.uid()` not wrapped in `(select auth.uid())`, re-evaluated per row). Cosmetic at current data volume; candidate for a policy-consolidation cleanup pass once real user volume exists.

**Remaining:** Task 11 (Singapore project provisioning — gated on Ivan, see below) · user pushes the commit backlog manually · **CPD Sprint 2 next** (auth split — Supabase native OTP/TOTP — + security shell/proxy.ts hardening + the `write_audit_event` caller-identity decision above).

Old Phase 9 (pg_cron emails) is **absorbed** into CPD Sprint 4. Old Phase 8 (workshop-MVP Vercel deploy) is **PAUSED, not dead** (Ivan's call, 2026-07-04) — requires an explicit go decision. Everything below this banner is the pre-pivot record, kept for reference; the CARRIED-FORWARD engineering patterns (Q18, Q19, three-layer validation, rate-limiting, email_log rules) remain binding.

---

## PRE-PIVOT ACTIVE PHASE (superseded) — Phase 8 — Vercel deploy

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
| 8 (workshop MVP) | ⏸️ **PAUSED** (not dead) | Vercel deploy of the pre-pivot MVP; superseded in priority by the CPD pivot, kept as an option pending explicit go |
| MVP email gaps | ✅ shipped (code) | Email #2 reminder/pass (personal CID QR) + Email #3 survey invite: templates + `sendReminderForEvent`/`sendSurveyInviteForEvent` actions + `email_log_dedup_idx` idempotency · on devEmailStub · vitest 390 → 436 |
| 9 (pg_cron) | absorbed into CPD Sprint 4 | — |
| **CPD Sprint 0** | ✅ shipped 2026-07-04 | Hygiene: PKCE fix, review-mode strip, migration drift reconciled 26/26, build pack + BASELINE-DELTAS landed |
| **CPD Sprint 1** | ✅ shipped 2026-07-04 | Multi-tenancy (`organisations`, `staff.organisation_id`, `events.organisation_id`) + `users` mirror + hash-chained `audit_events` + consent/DSR + fixed `pseudonymise_user`; real-DB RLS + chain integration suite 17/17; vitest 438 passed \| 17 skipped |
| **CPD Sprint 2** | **next** | Auth split (Supabase native OTP + TOTP MFA) + `proxy.ts` security shell hardening |

---

## How to keep this current

- The phase that just shipped updates this doc as part of its `docs/plans/handoff_DDMMYYYY.md` close-out.
- "ACTIVE PHASE" rotates to the next phase's design plan.
- "JUST SHIPPED" rotates to what was previously ACTIVE.
- "CARRIED-FORWARD CONSIDERATIONS" gets new items appended; resolved items removed.
- If this file's `Last updated` is more than one phase out of date, treat it as stale and prefer the latest handoff doc in `docs/plans/`.
