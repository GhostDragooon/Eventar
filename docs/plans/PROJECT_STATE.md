# Project State — Eventar

> ## ⬆️ CURRENT PHASE (2026-08-01) — M2 FRONTEND UNFREEZE, Stage 1 of 4 shipped
>
> **The frontend freeze is LIFTED for S-Organiser.** Ivan made the M2 unfreeze scope call, with the framing correction that the design artifact is *the real frontend*, not a mockup — the work now is fusing it with the shipped backend.
>
> - **Read first:** `docs/plans/2026-08-01-m2-frontend-unfreeze.md` (scope boundaries, block-architecture admission checklist, 4-stage staging, Stage 1 findings).
> - **Shipped:** Stage 1 tokens (`046b21c`) · Stage 2 shell + Stage 3 CPD-config-front-to-back (`c291bce`) · patches (`56d5a7f`) · design audit (`c0c7105`). Gates green; 19 routes; vitest **480 passed | 120 skipped**; head `1f993fc`.
> - **Next:** the scheduler (reminder + survey do not fire on their own) → roster licence eligibility → CPD config at event creation. All three are build gaps needing no external input.
> - **STILL GATED, and not by the freeze:** the CPD evaluator vs versioned `body_rules` (Q26 + Milestone C), practitioner compliance math, S-Attendee, B6 evidence/share, multi-track scheduling.
> - **Owed:** the three-lens phase-completion protocol at the M2 phase boundary — it has NOT run for ANY M2 stage and is not claimed.
> - **Latest handoff:** `docs/plans/handoff_02082026.md` — Stages 1–3 shipped, framing corrections, defects, and the corrections to earlier claims.
> - **Next session:** `docs/plans/2026-08-02-m2-execution-plan.md` §2A (scheduler).
>
> Everything below predates the unfreeze.

_Last updated: 2026-07-25 (**CPD MVP attendance-verified issuance — Stages 0–8 shipped, then HARDENED after a three-lens phase-completion review that found two real authorisation holes**. The review is the headline, not the build: an earlier version of this very section claimed "ALL SHIPPED" before the review had run — that claim was premature and is corrected here. The build itself works (config-free `award_attendance_credit()` on both check-in paths, `reconcile-event.ts`, Stage 8's freeze trigger, all live-proven), but the review found that an organiser could bind their own event to ANY accrediting body with unbounded hours, and that `attendance_verified` was minted by possession of an emailed code with no lifecycle binding at all. Both now closed at the grant/definer layer with live-proven regression tests; the product questions underneath are in `docs/DEFERRED.md`. **Still open: Ivan's carried inputs (price, first-meeting date, D0 flip, vault Sprint↔Milestone reconciliation).** Full detail: this doc's CPD MVP section below + `docs/plans/handoff_25072026_v2.md` (the review session; `handoff_25072026.md` covers the build session and is marked superseded). Prior: Milestone A section below + `handoff_22072026.md`.)_

> Source of truth for "what's active vs forward-looking."
> **Read this BEFORE writing any code.** Updated at the end of each phase.
> Vault decisions live at `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`.

---

## ⚠️ PIVOTAL DIRECTION CHANGE — 2026-07-03

Eventar pivoted from internal workshop manager to a **CPD/CME/CE event + credit platform** (HK launch, HKCP first accrediting body). Canonical record + frozen design baseline: vault note `20 — Roadmap/Pivot — CPD Platform (2026-07-03).md` + Decisions Log **Q20** (reverses Q6.3 single-org; supersedes Q5 magic-link-only staff auth).

**Active plan:** vault `20 — Roadmap/CPD Roadmap — Backend First.md` — backend first, **frontend frozen** (no new surfaces, no restyles; existing 18 routes keep working against a default organisation). CPD Sprint 2 added one backend-only route, `/api/security/csp-report` (19 routes total) — see Sprint 2 close-out below for full invariants.

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

**Remaining:** Task 11 (Singapore project provisioning — gated on Ivan, see below) · user pushes the commit backlog manually.

---

## CPD Sprint 2 — security wrapper + audit path + attendee identity: ✅ SHIPPED + PHASE-COMPLETION PROTOCOL PASSED (2026-07-08)

Executed end-to-end from `docs/plans/2026-07-04-cpd-sprint-2-implementation.md` via `superpowers:subagent-driven-development` (fresh implementer subagent per task, independent controller-dispatched review per task, live-DB verification throughout — not just static review). Full retrospective: `docs/plans/handoff_08072026.md`.

Directly answers Sprint 1's carried-forward item #1 (`write_audit_event` had no caller-identity check).

| Commit(s) | What it adds |
|---|---|
| `9640fad` | `lib/legalVersions.ts` — consent version pins; Sprint 2 baseline captured |
| `c35cb3b`, `86413dc` | **Task 1a** — `requireStaff()` gates `status='active'`. **Task 1b (role-union widen) split out and deferred to Sprint 3** — breaks `tsc` at 9 call sites via `StaffShell.tsx`/`SettingsClient.tsx`'s own local prop types; zero Sprint 2 consumer needs it (DB gate reads the column directly) |
| `56f3b04`, `2185dfc` | **Task 2** — `app_private.require_active_staff(variadic p_roles)`, the shared staff gate every audited definer function calls |
| `5611599`, `5e82ffb`, `6de2f10`, `1ed8b72` | **Task 3 (D1)** — `write_audit_event` EXECUTE revoked from `authenticated` + bare `PUBLIC` + (found later, at the exit gate) `anon`; `record_session_revocation` tightened to `service_role`-only; `verify_audit_chain` closed the same way. See "Two real defects" below |
| `c7ec4cb` | **Task 4** — `rateLimitBySession`/`rateLimitByUser` (§4 abuse-tier substrate) |
| `27fad95` | **Task 5** — `lib/withSecurity.ts` (auth → rate-limit → Zod → Q18 guard). Substrate only, not wired into any existing action this sprint |
| `da59f63` | **Task 6** — `grant_consent`/`withdraw_consent` (self-actor definer shape) |
| `8c48d1c` | **Task 7** — `transition_dsr` (staff-actor shape; first real PostgREST-exposed consumer of Task 2's gate) |
| `f027fae` | **Task 8** — `record_session_revocation` + `lib/abuseTier.ts` (§4, 3-in-60 auto-revoke). Not wired into any live Server Action — no authenticated attendee-facing surface exists yet to feed it |
| `7e2e2fb`, `9cfb36d` | **Task 9** — `lib/attendeeAuth.ts` (native email-OTP capability) + post-signup audited consent. API-testable only, no frontend |
| `556cb3a`, `d8708f1`, `3653a9a` | **Task 10** — self-check-in → `self_check_in()` definer fn. Two real defects + one exit-gate regression, see below |
| `f1a3041` | **Task 11** — staff-scan check-in → `mark_attended()` definer fn (owner-exclusive preserved) |
| `6357e7b` | **Task 12** — event publish → `publish_event()` definer fn; adds `events.published_at` (confirmed absent from live schema before this task) |
| `bb9e483`, `ef2bcfb`, `588028c` | **Task 13** — global security headers + report-only CSP in `next.config.ts` (not `proxy.ts` — its matcher excludes public routes) + `/api/security/csp-report` sink |
| `d10e2ea` | **Task 14 (exit gate)** — burst-throughput suite + full static/integration gates |

**Migrations:** 10 new, applied to the live Seoul project (`muieupgkpbxpqsrjjwol`) via Supabase MCP `apply_migration`, filenames reconciled against `list_migrations`'s actual recorded version after every single call (see defects below) — migration list two-sided, 43/43.

**Two classes of real defect found and fixed during execution:**

1. **Migration filename drift, every single time.** `apply_migration` has no version parameter — it assigns the remote version from server time at the moment it's called, ignoring the local filename entirely. Every one of the 10 new migrations required a post-apply `list_migrations` check + `git mv`/rename to reconcile. Locked into the plan as a mandatory step after the first miss (Task 2).

2. **A systemic grant gap, discovered mid-sprint and then found to recur twice more.** Task 3 (D1) found that revoking `write_audit_event`'s grant from `authenticated` alone was a no-op: this Supabase project has a schema-wide `ALTER DEFAULT PRIVILEGES` granting `anon`/`authenticated`/`service_role` EXECUTE on every new function at `CREATE` time, and the function also had a bare implicit `PUBLIC` grant from Sprint 1 — revoking a named role does nothing if `PUBLIC` (or the default ACL) still holds it. Fixed forward: every new Sprint 2 definer function got an explicit `revoke ... from public, anon` (or `service_role`-only for functions with no in-function actor check, like `record_session_revocation`).
   **The same class of bug still slipped through twice more, both caught only by the Task 14 exit-gate's phase-completion review, not by Task 3's own fix:**
   - `write_audit_event` itself still had `anon` EXECUTE — Task 3's two migrations closed `authenticated` and `PUBLIC` but never checked `anon` specifically, and D1's own negative test only ever exercised `authenticated`. Any unauthenticated caller holding the public anon key could forge an arbitrary, correctly-chained audit event. Fixed + two new anon-negative regression tests added.
   - The fix-attempt for `verify_audit_chain()` (`revoke ... from anon, authenticated`) was *itself* a no-op on the first try — that function's ACL carries a genuine bare `PUBLIC` entry, so revoking from named roles did nothing; the actual fix was `revoke ... from public`. Caught only by re-querying `has_function_privilege` after the "fix" and finding it unchanged.

   **Root-cause takeaway for Sprint 3:** "revoke from `authenticated`" and "revoke from `anon`" are not substitutes for "revoke from `public`" — check `pg_proc.proacl` directly (not just `has_function_privilege` on the roles you think matter) on every new SECURITY DEFINER function, and re-run `get_advisors` after every grant change.

3. **A real behavioral regression in the self-check-in conversion (Task 10), found only by the exit-gate's user-lens review.** The per-IP→per-event rate-limit switch was intentional and documented, but it had an undocumented side effect: an invalid/guessed code now returns before the rate-limit check is ever reached (per-event keying needs a resolved event), so guessing had **no rate limit at all** — undermining `lib/registrationCode.ts`'s own stated model ("887M codes — resists brute-force search ... paired with rate-limiting"). Fixed per Ivan's direction: `self_check_in(p_code, p_ip)` now rate-limits the guessing path specifically by IP (10/min), independent of the existing per-event 600/min cap for resolved codes — verified this doesn't reintroduce the venue-NAT problem the per-event switch was designed to fix (200 shared-IP legitimate check-ins still all succeed, P99 well under the 2s threshold).

4. **A test-harness bug in the new self-check-in migration** (`self_check_in_fn.sql`, Task 10): the original scalar-binding `select ... into` had the same bare-column-vs-OUT-parameter ambiguity Sprint 1 avoided by using `%rowtype` — fixed same-session in a follow-up migration, table-aliased throughout for every subsequent function.

**One test-cleanup leak found and fixed** (Task 10 review): `rate_limits` fixture rows leaked from 2 of 4 tests in `self_check_in.rls.test.ts` because only 2 pushed their key into the cleanup array. Fixed by tracking the key at fixture-*creation* time instead of relying on each call site to remember.

**Result:** static gates green (tsc clean · eslint 0 errors, 5 pre-existing unrelated warnings · vitest 461 passed \| 59 skipped · next build unchanged in shape, 19 routes incl. `/api/security/csp-report`) · `pnpm test:rls` 59/59 across 10 files · migration list 43/43 two-sided · existing routes backtested (curl 200/200/200 public, 307 staff-gated, unchanged) · manager reads unchanged (7 events / 63 registrations / 1 staff — untouched by any fixture).

**Phase-completion protocol — PASSED, two separate agents, run TWICE** (once at Task 14's own boundary, then re-run implicitly via the fixes' own re-verification):
- **Dev-lens review:** found the anon/D1 gap above (Critical) and confirmed all other structural claims hold (every definer function's `search_path` pinned, audit-write-last, grant/revoke matrix correct, `withSecurity`/`abuseTier`/`attendeeAuth` genuinely unwired, frontend freeze held with zero `.tsx` touches across 27 commits, migration history two-sided, no PII in any new log/payload). Also flagged the exit-gate's own burst test as occasionally flaky against real network conditions (~1-in-4 runs) — informational, not fixed, since changing the plan's own stated 2s threshold is a scope call, not a bug fix.
- **User-lens review:** found the self-check-in brute-force regression above (Important) and confirmed the three converted surfaces' user-facing behavior is otherwise byte-identical to pre-conversion (same error strings, same info-hiding on cross-owner/invalid codes), the frozen frontend is genuinely untouched, and the new report-only CSP + headers are inert to users (report-only means nothing is blocked).
- **Backtest:** executed throughout via live Supabase MCP queries (not mocked) — every grant, every migration, every fixture cleanup independently re-verified against the real Seoul project, not just read from migration file text.

**Carried forward from the reviews (not fixed now — explicitly tracked in `docs/DEFERRED.md`):**
1. **Task 1b** — `Staff.role` TS union widen to include `'eventar_staff'`, bundled with the Sprint 3 5-role enum migration + frontend unfreeze (same commit that will need to touch `StaffShell.tsx`/`SettingsClient.tsx` anyway).
2. **`withSecurity`, `lib/abuseTier.ts`, `lib/attendeeAuth.ts` are substrate, not wired to any live surface.** Wiring lands with the first authenticated attendee-facing mutation surface (post-freeze).
3. **Two residual bare-`PUBLIC` ACL entries** on `self_check_in` and `app_private.require_active_staff` — harmless (the former is already intentionally anon-open; the latter isn't PostgREST-exposed) but inconsistent with the explicit-revoke discipline established everywhere else. Cheap cleanup, not urgent.
4. **The exit-gate burst test's 2s threshold occasionally flakes** against real network conditions to the remote Seoul project (~1-in-4 runs observed, always well under 3s when it does). Not changed — Ivan's call whether to loosen it, make it informational, or leave as-is.
5. **P2 shared-vs-separate audit-chain lock decision** (credit ledger, Sprint 3) and the **abuse-tier live-caller wire-up** — both already tracked in `docs/DEFERRED.md`.

**Remaining:** Task 11 Singapore provisioning still gated on Ivan (unrelated to Sprint 2) · user pushes the commit backlog manually · **CPD Sprint 3 next** (credit ledger + 5-role enum + practitioner licences — see `docs/DEFERRED.md` for everything explicitly gated to it).

Old Phase 9 (pg_cron emails) is **absorbed** into CPD Sprint 4. Old Phase 8 (workshop-MVP Vercel deploy) is **PAUSED, not dead** (Ivan's call, 2026-07-04) — requires an explicit go decision. Everything below this banner is the pre-pivot record, kept for reference; the CARRIED-FORWARD engineering patterns (Q18, Q19, three-layer validation, rate-limiting, email_log rules) remain binding.

---

## CPD Sprint 3a — identity/tenancy DDL + licence mutations + credit_ledger core: ✅ SHIPPED + PHASE-COMPLETION PROTOCOL PASSED (2026-07-10)

Executed end-to-end from `docs/plans/2026-07-09-cpd-sprint-3a-implementation.md` via `superpowers:subagent-driven-development` (fresh implementer + spec-review + code-quality-review per task, controller commits), plus a full two-agent phase-completion pass (separate dev-lens and user-lens reviewers) at the exit gate. Full retrospective: `docs/plans/handoff_10072026.md`.

| Commit(s) | What it adds |
|---|---|
| `311a6e3` | **Task 1** — `users.preferred_name` + `display_language` |
| `6c31bff` | **Task 2** — 5-role staff enum widen (closes DEFERRED 15/16). Grew into fixing a live regression: `is_manager()` (the sole cross-owner-read RLS gate on events/registrations/agenda_blocks/survey_responses/speaker_checkins) and `pseudonymise_user` both hardcoded the retired `'manager'` literal — the sole staff account had already silently lost cross-owner read access before the fix landed |
| `d199c92` | **Task 3** — `accrediting_bodies` table + RLS |
| `b962852` | **Task 4** — `organisers` table + RLS |
| `6b23af1` | **Task 5** — `practitioner_licences` table + RLS. Code review found the originally-planned self-write policy would let a practitioner forge their own `status='verified'` — dropped in favour of function-only mutation (Task 6) |
| `ab7f9b1` | **Task 6** — 6 audited licence-mutation functions (`declare`/`set_primary`/`verify`/`lapse`/`revoke`/`supersede_licence`). Code review found `supersede_licence` had no from-state guard, letting a practitioner self-route around a staff revocation — fixed (blocks superseding `revoked`/`superseded`) |
| `4c9cd3b` | **Task 7** — seed 8 HK accrediting bodies (6 citation-grounded active, LSHK onboarding, HKAM deferred). HKIE `retention_years` NULL — no source states a figure (Q24 verified absence) |
| `65669fc` | **Task 8** — `credit_ledger` + own hash chain (§8.4, separate advisory lock from `audit_events`). Code review found the hash had no field delimiter (a real collision: `points=1,hours=1` and `points=11,hours=NULL` hashed identically), covered only 6 of ~15 semantic columns, and the append-only posture wasn't enforced against `service_role` — all fixed and backtested live before any real row existed |
| `75dd2e6` | **Task 9** — `record_credit_entry` (sole ledger writer, service_role-only) + `credit_disputes`. Branching (the planned concurrency-test approach) turned out to need a paid Supabase plan this project doesn't have — backtested directly against live instead (10-row + a `credit_transferred` chain, fully cleaned up) |
| `f8c0ca1` | Exit gate — `get_advisors` found 5 unindexed FKs introduced this sprint; fixed |
| `f823a9c` | Exit gate dev-lens review (separate agent) found `practitioner_licences` still granted INSERT/UPDATE/DELETE to `anon`/`authenticated`/`service_role` at the table level — RLS blocked the first two but not `service_role` (BYPASSRLS), so the six Task 6 functions were never actually the sole mutation path. Also added the missing `transfer_reference_id` param to `record_credit_entry` |
| `9d2b357` | Exit gate user-lens review (separate agent) caught the dev-lens fix breaking this sprint's own test fixtures (16/34 tests) — fixtures rewritten to use the real RPCs; re-granted `DELETE` (not INSERT/UPDATE) to `service_role` on Ivan's call, since `practitioner_licences` isn't a permanent ledger like `credit_ledger` and has no ephemeral-branch testing path |

**Migrations:** 21 new (`20260709120000` through `20260709320000`), applied to the live Seoul project via CLI `db push`, migration list two-sided 63/63 — no drift.

**Result:** static gates green (tsc clean · eslint 0 errors, 5 pre-existing unrelated warnings · vitest 461 passed \| 92 skipped · next build unchanged, 19 routes — frontend freeze held) · `pnpm test:rls` 92/92 across 14 files · `credit_ledger`/`credit_disputes`/`practitioner_licences` confirmed empty at ship (no synthetic residue in the regulator-facing tables) · `get_advisors` clean of new findings after the FK-index fix.

**Phase-completion protocol — PASSED, two separate agents, both found real issues fixed before shipping:**
- **Dev-lens review:** found `practitioner_licences`' table-grant gap (above) and the missing `transfer_reference_id` param. Confirmed correct: grant hygiene on all 9 new functions, `credit_ledger`'s append-only posture, the 3 `body_admin_read` RLS policies, the multi-tenancy exception (`practitioner_licences`/`credit_ledger`/`credit_disputes` deliberately cross-tenant, documented), and — via a live 10-row backtest under varied session GUCs (`DateStyle`, `TimeZone`) — that the hardened hash chain is genuinely deterministic, not just deterministic-by-luck on this session's settings.
- **User-lens review:** found the dev-lens fix's own regression (above) by actually running the committed test suite, not just reading it. Also found `PROJECT_STATE.md` was stale (fixed by this update) and `DEFERRED.md`'s handoff-doc pointer was an unfilled placeholder (fixed). Two Minor UX findings logged for Sprint 3b: `declare_licence` leaks a raw FK-violation dump for a bad `p_body_id`, and `record_credit_entry` doesn't cross-validate that `p_licence_id`/`p_user_id`/`p_body_id` are mutually consistent.
- **Backtest:** every migration verified live via Supabase MCP throughout, not just read from file text — including three separate live exploit attempts (forge-verified-status via direct write, route around a revocation via supersede, bypass the append-only ledger via `service_role`), all confirmed blocked, and one hash-collision + one tamper-detection proof executed and cleaned up.

**Carried forward from the reviews (not fixed now — explicitly tracked in `docs/DEFERRED.md`):**
1. `credit_disputes` and `credit_ledger`'s hash chain both have zero automated test coverage — no safe way for a committed test to create-and-clean-up a real `credit_ledger` fixture row (service_role can create via `record_credit_entry` but can't delete). Verified manually instead (documented in commit messages); gated on Sprint 3b's real event-transition wiring or Supabase branch-CI support.
2. `is_manager()`'s role coverage (`organiser_admin`+`eventar_staff`) isn't yet extended to 4 app-layer TS authorization checks (still `eventar_staff`-only) — deliberate minimal-scope call, no `organiser_admin` account exists yet.
3. Licence-mutation functions are transition-agnostic on `verify`/`lapse`/`revoke`/`set_primary` (only `supersede_licence` got a from-state guard) — decide whether this family needs a real state machine before Sprint 3b's reviewer workflow relies on status transitions.
4. Two Minor UX findings (FK-violation error leak, `record_credit_entry` cross-field validation) — see above.

**Remaining:** Task 11 Singapore provisioning still gated on Ivan (unrelated) · user pushes the commit backlog manually · **CPD Sprint 3b next**, gated on the external-voice review (not yet scheduled) — see `docs/plans/2026-07-09-cpd-sprint-3b-design.md`.

---

## Milestone A — demo-ready + set_staff_role/grant-hygiene live: ✅ SHIPPED + PHASE-COMPLETION PROTOCOL PASSED (2026-07-18)

Executed end-to-end from `docs/plans/2026-07-12-milestone-A-executable.md` via `superpowers:subagent-driven-development` across two sessions (Tasks 2–10 + 6 on 2026-07-17; Task 13's owed phase-completion protocol + its fix on 2026-07-18), with heavy live verification throughout. Milestone A per the consolidated spine (`docs/plans/roadmap-to-mvp.md`, superseding this doc's old Sprint-3b framing — see the matching vault flag in `CPD Roadmap — Backend First.md`): the demo runs clean on the local stack, collateral is drafted, the CI replay/tamper harness exists, and `set_staff_role` + grant hygiene are closed. Full retrospectives: `docs/plans/handoff_17072026.md` (build session) + this section (review session).

| Commit(s) | What it adds |
|---|---|
| `603c761` | **Task 2** — `seed-demo.ts`: draft event, 6 attendees, operator + practitioner. Idempotent (find-or-create); verified byte-identical on repeat runs |
| `4723b83` | **Task 3** — `reset-demo.ts`: teardown + reseed + chain-verify, local-only (`localEnv()` hard guard) |
| `3e6f390` | **Task 4** — `render-emails.ts`: confirmation + reminder HTML, QR as data-URI (production ships `cid:`) |
| `6daa7a7` | **Task 5** — `ledger-demo.ts`: the trust-moment driver (post → block (`42501`) → tamper → `verify_ledger_chain()` detects) |
| `4ed6abf`/`8f1142d` | **Task 6 (CI)** — replay-from-zero + tamper-detection script + Actions workflow (`on: [push, pull_request]`). Written but unexecuted until this section's push — sandbox `docker exec` hangs even with Docker healthy |
| `a859cbb` | **Task 7** — `seed.sql` grant-restore, closing a Supabase CLI 2.109.1 default-privilege gap; Hard Rule 11 reverified intact |
| `8c31b2a` | **Task 9** — `set_staff_role()` **LIVE Seoul migration**: audited, definer-only staff role mutation. RED→GREEN caught a real bug — the first migration's column-level `revoke update (role)` was a no-op against `anon`/`authenticated`/`service_role`'s table-level `UPDATE`; corrected in a follow-up migration (revoke table UPDATE, grant back column UPDATE on every column except `role`) |
| `e2730e9` | **Task 10** — grant hygiene (`pseudonymise_user` closed off its bare `PUBLIC`+`anon` grants — exactly what `get_advisors` had flagged) + `tests/helpers/mustDelete.ts` fail-loud fixture cleanup, which immediately surfaced and let us delete two real ~6-day-old orphan rows on live |
| `0cddd2e` | Fixed a real demo-breaking bug found by actually driving the run sheet in a browser (Task 6 rehearsal): `seed-demo.ts`'s 45-min start offset put every fresh fixture already past the check-in-window boundary, so registration could never be open at Beat 3. Widened to 90 min — **incomplete, see `2876e06`** |
| `2876e06` | **Task 13 (this session)** — the owed three-lens phase-completion protocol, run for real: dev-lens + user-lens + `everything-claude-code:security-reviewer` (scoped to Tasks 9–10's live grants) + a live-Seoul backtest. Found and fixed the real gap the reviews surfaced: 90 min still left only a ~30-min registration window, which the run sheet's own 30-min prep block consumes — widened to **180 min** (~120-min window), the fixture banner now prints the registration-close deadline, and the run sheet + `DEFERRED.md` were corrected to match (see protocol detail below) |

**Migrations:** 3 new (`set_staff_role`, `staff_role_update_lock_fix`, `grant_hygiene_residual_public`), applied to the live Seoul project (`muieupgkpbxpqsrjjwol`) via Supabase MCP `apply_migration`. Migration list two-sided, **69/69** (verified via `list_migrations` during this session's backtest).

**Result:** static gates green (tsc clean · eslint 0 errors, 5 pre-existing unrelated warnings in `lib/devEmailStub.*` · vitest **461 passed | 106 skipped** · next build unchanged, **19 routes** — frontend freeze held) · `reset-demo.ts` re-run end-to-end post-fix: fresh reseed printed a 120-min registration window, both audit + ledger chains clean · **37-commit backlog pushed to `origin/main`** (triggers `replay-verify.yml` for its first real run — CI result not yet confirmed from this session, no `gh` auth available).

**Phase-completion protocol — PASSED, THREE separate agents (dev-lens + user-lens + a dedicated security-reviewer, per Task 13's resume-line instruction, since Tasks 9–10 touched live-Seoul privilege grants) + a live backtest run by the controller:**
- **Dev-lens review** (`superpowers:code-reviewer`): nothing Critical/Important. The brief's own premise — "the 5-role enum is deferred to Sprint 3" — was itself stale; the enum shipped 2026-07-09 (Sprint 3a), so `set_staff_role`'s free-text `p_new_role` is bounded by a live CHECK constraint, not an open privilege-escalation gap. Confirmed the anon column-UPDATE grant is inert (no write RLS policy on `staff`), the timing fix's arithmetic was correct as far as it went, and the `mustDelete` rollout is careful (never wraps the intentionally-unwrapped `audit_events`/`credit_ledger` deletes). Minor: no positive round-trip test for `staff`'s retained non-role column grants (Hard Rule 11 wants one); no in-function role allowlist independent of the DB CHECK; no last-active-operator lockout guard.
- **User-lens review** (general-purpose agent, cold-start operator journey through the run sheet): this is where the real bug was — see "Two real defects" below. Also flagged: reset regenerates registration codes with no re-render step in the run sheet (stale QR → "Code not recognised" at Beat 4), `render-emails.ts` was never named in the run sheet's prep steps, the seed never printed the one deadline the operator has to beat, and Beat 4's "second attendee types their manual code" described a UI that doesn't exist on the attendee side (that's the staff surface). All fixed in `2876e06`.
- **Security review** (`everything-claude-code:security-reviewer`, scoped to Tasks 9–10's live grants): **verdict "ship as-is," no Critical/High.** Independently re-derived the same CHECK-constraint and RLS-policy facts the dev-lens found, plus confirmed `search_path` pinning, audit-insert-last ordering, non-forgeable actor identity, and the Hard Rule 11 negative test's specificity (asserts exact `42501`, not a bare error). Two Low findings, both latent (not live exposures): the same missing-lockout-guard item, and the `anon` entry in the staff column grant-back (dormant — no UPDATE RLS policy exists — but no legitimate use either).
- **Backtest** (controller, live Seoul via Supabase MCP — not trusted from migration text): confirmed the exact grant matrix (`has_table_privilege`/`has_column_privilege`/`has_function_privilege` per role), the live `staff_role_check` CHECK bounding `set_staff_role`'s input, `staff`'s RLS policy set (`staff_self_read`, SELECT-only — the anon grant has no path to a write), migration list two-sidedness, and `get_advisors` (confirms `pseudonymise_user` no longer appears under the 0028 anon-executable finding; `set_staff_role` carries only the same benign 0029 authenticated-executable WARN every sibling definer function has). Every "NEEDS LIVE PROBE" request from all three review agents was answered by this backtest, independently, before the reviews returned — full convergence, zero contradictions.

**Two real defects found and fixed across the two sessions** (beyond the ones already in the commit table above):
1. **The registration-timing fix landed 2026-07-17 was incomplete** (found by this session's user-lens agent) — `0cddd2e` correctly diagnosed that a 45-min offset put the event inside its own check-in window at seed time, but its 90-min replacement left only a ~30-min registration-open buffer, which the run sheet's own 30-min prep block fully consumes — so registration could still be closed by the time an operator reaches Beat 3 live, reproducing the original symptom one level up. Fixed to 180 min (`2876e06`); the fixture banner now surfaces the deadline directly instead of requiring the operator to compute it.
2. **The run sheet described an attendee-typed manual-code entry that doesn't exist** — `/checkin/confirm` reads the code from the URL with no typed-entry field; manual code entry is a staff-tablet surface (`ScanAndManual.tsx`), not an attendee one. Reworded Beat 4 to the two real mechanics.

**Carried forward from the reviews (not fixed now — tracked in `docs/DEFERRED.md`, 4 new rows added 2026-07-18):**
1. `set_staff_role` residual hardening (in-function role allowlist, last-active-operator guard) — deferred to Sprint 3b's org-admin delegation model, not a live gap today (gate is already the top role; every change is audited; CHECK bounds the value on the live DB).
2. `anon` in the `staff` column-UPDATE grant-back — dormant (no write RLS policy), latent footgun; narrow to `authenticated, service_role` next grant-hygiene pass.
3. Hard Rule 11 positive-round-trip test missing for `staff`'s retained column grants — one-test addition, next time `staff` grants/tests are touched.
4. `WK-` (workshop) registration-code prefix visible during CPD demos — cosmetic branding leak, deferred to frontend unfreeze (touches the frozen app + existing live codes).
5. Item 19 (three residual bare-`PUBLIC`/`anon` grant entries) marked **✅ CLOSED** — `pseudonymise_user`'s share of it was exactly what Task 10 fixed, confirmed live.

**Remaining:** Task 12 (graph refresh via `/graphify --update`) — **not attempted this session** (this session's scope was the code-review protocol + push, not graph maintenance; the account-session-limit block the prior session hit should have cleared by now, but that's untested) · Task 11 Singapore provisioning still gated on Ivan (unrelated) · `replay-verify.yml`'s first real run is in flight on GitHub Actions as of this push, result unconfirmed from this session · vault `CPD Roadmap — Backend First.md`'s Sprint-numbered body still needs full reconciliation into the Milestone A–E spine (flagged there, Ivan's call on scope) · next per `docs/plans/roadmap-to-mvp.md`: Milestone B (field-proven — real events on a hosted URL) or continuing toward Milestone C (the body review), both gated on Ivan's outstanding inputs (price, first-meeting date, D0 deploy flip) carried from `handoff_17072026.md`.

---

## CPD MVP — attendance-verified issuance: Stages 0–8 shipped + review-hardened (2026-07-25)

Executed end-to-end from `docs/plans/2026-07-23-cpd-issuance-execution-plan.md` (rev.1, two rounds of external review folded in) per the architecture in `docs/plans/2026-07-23-cpd-mvp-architecture.md` / vault `20 — Roadmap/CPD MVP — Architecture (2026-07-23).md`. Loop: **create → publish → attend → feedback → CPD logged**, end-to-end and tamper-evident, on seeded identities, frontend still frozen. This is a parallel track alongside Sprint 3b's gated governance/evaluator engine, not a replacement for it — Q26 and the body-rules evaluator remain out of scope, per the architecture doc's "config-free issuance admissible pre-Q26" doctrine. Full retrospective: `docs/plans/handoff_25072026.md`.

| Stage | What | Commit | Status |
|---|---|---|---|
| 0/8 | Baseline capture (gates green, Seoul: 69 migrations, `credit_ledger` 0 rows) | — | ✅ |
| 1/8 | `events.accrediting_body_id` + `cpd_hours` + `credit_ledger_attendance_uniq` partial index | `7aa617f` | ✅ applied to Seoul |
| 2/8 | `award_attendance_credit()` definer + `lib/cpd/awardAttendanceCredit.ts` wrapper | `d751f67` | ✅ applied to Seoul |
| 3/8 | Wired into `selfCheckIn` + `markAttended`, fires only on fresh (`'ok'`) transitions | `6fed9d2` | ✅ |
| 4/8 | Seed identity chain (Karen Lau — real account + verified HKAM licence) | `0d6f83e` | ✅ live-browser-proven |
| 5/8 | `tests/cpd/attendance_issuance.rls.test.ts` — issue, idempotency, a real `Promise.all` race, guards | `4ecb24a` | ✅ 4/4 green live |
| 6/8 | `scripts/cpd/reconcile-event.ts` — the recovery + retroactive-post path | `0916a8d` | ✅ live-verified (miss-fill + no-duplicate re-run) |
| 7/8 | Run-sheet Beat 4.6 + `docs/DEFERRED.md` re-entry rows + this status update | `f738197`, `fe3756d` | ✅ |
| 8/8 | 🟡 event-config freeze trigger — Ivan confirmed include | `4e71ab5` | ✅ applied to Seoul, live-verified |

**Four real schema mismatches the build itself caught** (Stages 1–4, not the plan, not either review round): `entry_type='attendance'` doesn't exist (re-keyed to `entry_type='credit_earned' AND attestation_status='attendance_verified'`); `attestation_status` CHECK widened to add `'attendance_verified'` (a distinct, stronger provenance tier than `organiser_attested`); `public.users` has no email column (identity resolution moved inside the `award_attendance_credit` `SECURITY DEFINER` function, which can read `auth.users`; the TS layer can't); `practitioner_licences.status` has no `'active'` value (good-standing state is `'verified'` — corrective migration `20260724170650`).

**Two bugs only live-browser verification caught (Stage 4):** the main checkout's `.env.local` points at Seoul, not local (`pnpm dev`/`:3000` is a live-Seoul server — use the `demo-local` launch config on `:3100`) · the kill switch defaulted **off** (required explicit `CPD_ISSUANCE_ENABLED==='true'`, which nothing set, so every award silently skipped with nothing logged) — inverted to fail-open (`==='false'` disables), added the missing skip-log, added a regression test.

**Result:** static gates green (tsc clean · eslint clean, one benign "no config" warning on the new `.sql` file, same as every migration · vitest **466 passed | 114 skipped** · next build unchanged, 19 routes — frontend freeze held) · `tests/cpd/attendance_issuance.rls.test.ts` 4/4 green live · `tests/cpd/event_freeze_trigger.rls.test.ts` 3/3 green live (blocks a credited event's config change with `22023`, allows an unrelated-field update on the same row, allows the same config change on an uncredited event) · Seoul migration count **74** · every stage that touched a live user-facing or operational flow found a real bug via live verification that static gates missed alone (Stage 4's two bugs, Stage 6's own live miss/re-run proof) — the load-bearing lesson of the whole build.

**Stage 8 detail:** `freeze_cpd_config_if_credited()`, a `security definer` BEFORE UPDATE trigger on `public.events` (definer because an event's owner has no RLS-visibility into `credit_ledger` for that event — an invoker-rights trigger would see zero rows and never fire, same precedent as `award_attendance_credit`). Raises `22023` iff `cpd_hours`/`accrediting_body_id` change on a row `credit_ledger` already references; every other column update passes through untouched. Confirmed live against real Seoul residue data (a credited fixture event blocked, an unrelated-field update on it allowed, an uncredited event's same fields still changeable) before the committed test was even written. **No live caller can reach it today** — grepped `app/`+`lib/`: nothing references `accrediting_body_id`/`cpd_hours` outside the seed script, so no real user can trigger the raw `22023` yet; revisit copy/UX only once an unfrozen surface lets an organiser edit these fields.

**Carried forward** (6 rows added to `docs/DEFERRED.md` 2026-07-25, each already pointed at a native/installed target, no new deps): retry-queue/`pending_credit` state, `creditIssued` API field (needs an unfrozen surface), live kill-switch toggle (deploy-time only today), the real-world issuance-rate bound tied to self-serve accounts + roster ingestion, per-body chains + lock-timeout (global advisory lock has no acquisition timeout), cross-cutting UX/perf polish.

### Phase-completion protocol — RUN AFTER the build was prematurely marked shipped; found 2 real authorisation holes

Three separate agents (dev-lens `superpowers:code-reviewer`, user-lens general-purpose cold-start journey, security-lens `everything-claude-code:security-reviewer`) plus a controller-run live backtest against Seoul + the local stack. **Every agent finding was independently re-verified against the live DB before being acted on** — which mattered: one HIGH was false and one cross-agent contradiction had to be settled on evidence rather than averaged.

| Finding | Verdict | Resolution |
|---|---|---|
| **HIGH-1** — an organiser could `PATCH` their own event's `accrediting_body_id`/`cpd_hours` straight through PostgREST (`events_organizer_update_own` has no column restriction; both columns carried a table UPDATE grant; `cpd_hours` had no upper bound). Every registrant with a verified licence at the targeted body then earned a permanent credit that body never authorised. | **CONFIRMED** (scope corrected: `anon` has no UPDATE policy, so its grant was inert — it's an authenticated organiser on their own event) | Fixed `20260725144446`: table REVOKE then column re-grant on all-but-the-two, `cpd_hours <= 24`, self-verifying DO block. Live-proven: `authenticated` UPDATE of `cpd_hours` → `42501`, `title` → still allowed. Product model deferred (`DEFERRED.md`). |
| **HIGH-2** — `attendance_verified` was minted by possession of an emailed code: `self_check_in` enforces no time window, no `self_serve` mode check, and its predicate is only `status <> 'attended'` — and `cancelled` is a legal status. Pre-build this forged a correctable flag; post-build it wrote an unrevocable regulator-facing row. | **CONFIRMED** | Guards added inside the issuance definer (never the attendance path — invariant 1): `skipped:cancelled` + `skipped:outside_window` (±24h). Bound is generous *by necessity* — the demo registers and checks in ~170 min before start; documented + deferred. |
| **HIGH-3** — `attestation_status` and 8 other columns claimed to be outside the hash envelope, so a tamper could flip the provenance tier undetected. | **FALSE — agent error** | The agent read the superseded original hash in `20260709250000`. Live `compute_credit_ledger_hash()` **and** `verify_ledger_chain()` both cover all 18 columns and pin `TimeZone`/`DateStyle`/`bytea_output`; the `20260709260000` hardening already fixed exactly this. No action. Recorded because passing it through unchecked would have falsely alarmed about the product's core claim. |
| **Cross-agent contradiction** — dev-lens said `ledger-demo.ts` double-credits *the same practitioner* (6.5h on a 3h event); user-lens said they are two different accounts sharing a display name. | **user-lens correct** | Live DB shows two distinct user ids both `full_name = 'Karen Lau'` (`demo-doctor@local.test`, who was *also the keynote speaker*, and `k.lau@demo.test`). The run sheet told the operator to call them "the same person, by design" — in front of a body that asserts sanctioned double-counting. Practitioner renamed to Dr. Elaine Tsang and decoupled from the keynote; run sheet corrected. |
| **I1** — `supabaseAdmin()` sat outside the try in the staff path; it reads `process.env` with non-null assertions, so a misconfigured deploy throws *after* attendance commits — the response inversion invariant 1 forbids. | CONFIRMED | Moved inside the boundary. New `app/events/[id]/checkin/actions.test.ts` proves it red-then-green (bug restored → exactly that test fails). |
| **I2 / M3 / L2** — `reconcile-event.ts` printed attendee `full_name` (Hard Rule 10). All three lenses found it independently. | CONFIRMED | Prints `registration_id`; also now prints its target DB and distinguishes "wrong event id" from "nobody attended". |
| **MEDIUM-1** — idempotency index enforced a narrower rule than every comment claimed (tier-scoped, so a second `credit_earned` at another tier didn't conflict). | CONFIRMED | Widened to `entry_type = 'credit_earned'`; verified zero existing rows violate it first. |
| **MEDIUM-2 / MEDIUM-4 / LOW-3** — case-sensitive kill switch; staff credits recorded no actor; freeze trigger kept a needless `service_role` grant. | CONFIRMED | Trimmed/lower-cased match; staff path now passes the staff **auth user id** (the plan's literal `staff.id` would have raised `23503` — `actor_id` references `users(id)`); grant revoked. |
| **Controller-found (not by any agent)** — `seed.sql`'s blanket grant re-opened the HIGH-1 column lock on every `db reset`. | CONFIRMED | Caught only by actually running `supabase db reset` after the migration. `seed.sql` now re-asserts the events column lock alongside the existing `staff`/ledger ones. **Without this, CI replay-from-zero and the future Singapore provisioning would both have produced an unprotected database.** |
| **Controller-found** — local stack was missing Stage 8 entirely; `credit_ledger.actor_id` NULL on all 7 rows. | CONFIRMED | Local replayed from zero (all migrations + hardening green, self-verifying blocks pass on a fresh DB). |

**Post-fix gates:** tsc clean · eslint 0 errors (5 pre-existing `devEmailStub` warnings) · vitest **470 passed | 119 skipped** (4 new action-boundary tests; the 5 new live guard tests skip without `RLS_TESTS`) · `pnpm exec vitest run tests/cpd/` **12/12 green live** against Seoul, including the two new HIGH-2 guards and the three HIGH-1 column-lock/ceiling tests · local `supabase db reset` replays all 76 migrations clean.

**Remaining:** nothing execution-side on this build. **Update (2026-07-26, see `docs/plans/handoff_26072026.md` for full detail):** this build was backtested end-to-end through the real app (not just RPC calls) and **pushed** — `origin/main` is current at `da7ef87`, the `/Users/ivan/Eventar-demo` worktree fast-forwarded to match, no more manual file-copying needed. `NewEventForm.test.tsx`'s flake crossed the 3rd-occurrence threshold this session (now diagnosed, not fixed — see DEFERRED.md) — do not silently re-promise "twice this week," it's now 5 occurrences total. Ivan then redirected to closing `docs/DEFERRED.md` backlog items directly (4 closed, TDD/live-verified, two-agent-reviewed — detail in the new handoff) rather than waiting on his own outstanding inputs, which are unchanged and still carried from `handoff_25072026.md`: `[PRICE]` in `docs/collateral/one-pager.md` + outreach email/phone, first internal-meeting/body-review date, D0 deploy flip, whether to reconcile vault `CPD Roadmap — Backend First.md`'s Sprint body into the Milestone A–E spine · `credit_ledger` carries harmless dev-project residue on both Seoul and local from live test/proof runs, accepted debt per `docs/DEFERRED.md` · next per `docs/plans/roadmap-to-mvp.md`: Milestone B or Milestone C, still gated on Ivan's inputs above — nothing this session unblocked them.

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

- ⚠️ **SUPERSEDED 2026-08-01 — the freeze is LIFTED and this thread is no longer "exploration."** Ivan's correction: the artifact is not a mockup exercise, it is the real frontend, and it is now being fused with the shipped backend. Active plan, scope boundaries and staging: `docs/plans/2026-08-01-m2-frontend-unfreeze.md`. Stage 1 (design-language fusion) shipped in `046b21c`. The rest of this bullet is the pre-unfreeze record:
- **Parallel frontend design-exploration thread (not part of this milestone, freeze held throughout)** — a separate session track has been iterating a mockup artifact for the eventual M2 unfreeze since 2026-07-13. Nothing in it has touched repo frontend code. Current state, decisions locked so far (blue-ramp palette replacing teal, white-ground-always, three-layer design method, global-shell-once architecture), and what's still open (landing aesthetic not yet locked, most organiser/practitioner pages still stubbed) are in `docs/plans/handoff_23072026.md` + the full log at `docs/plans/2026-07-13-cpd-frontend-design-exploration.md`. Read before doing any frontend design work so the two threads don't diverge or duplicate.
- **Parallel course-finder research thread (started 2026-07-26, explicitly apart from infrastructure)** — reviewing how to populate a public directory of accredited CPD/CME courses (HKIE, AHP Council PT/OT, medical) as a discovery/outreach layer, gated on nothing (all sources public), not gated by anything either. No Supabase tables, no app routes, no frontend — flat-file research only in `docs/research/course-finder/`. Full source landscape, registry cross-check (found: `OT_BOARD` isn't seeded; `HKAM`'s 15 Colleges are unseeded beneath an inert parent shell), lifecycle/flow map, and open decisions in vault `20 — Roadmap/Course Finder — Discovery Layer (2026-07-26).md`. Read before doing any related work so this doesn't silently duplicate or drift from what's already decided there.
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

_(Refreshed 2026-07-12 — HKCR retention resolved via a sourced document; treat anything below as current.)_

**Still genuinely open — not yet decided by anyone:**
- Credit Ledger §8.2 — seed real per-body category taxonomies now vs. keep `credit_ledger.category` free text until an organiser-facing picker ships (product sequencing call, Ivan's, not yet made)

**Resolved 2026-07-12** (Ivan sourced 12 primary CPD/CME documents; see vault `30 — Reference/CPD Source Documents — Body Manuals & Forms.md`):
- HKCR retention/cycle/category — was "genuinely unverified (site blocks automated fetch)". Now verified against `HKCR_CMECPD_Guidelines_2026-2028.pdf` (endorsed by HKAM Council 15 May 2025, effective 1 Jan 2026): **no retention-period clause stated anywhere in the 19-page guidelines** — a verified absence, same pattern as HKIE below. Cycle = 3 years (calendar-year start); minimum 90 points/cycle, ≤30 of which may be Category B. Not yet folded into vault Decisions Log Q24's citation table — do that before relying on it in code. **Caveat: this source batch does NOT contain the HKCP manual** (Hong Kong College of Physicians, the specific document roadmap-to-mvp.md names as gating Sprint 3b's rules seed) — that sourcing item stays open.

**Resolved 2026-07-10** (Sprint 3a Task 7 — see `docs/plans/handoff_10072026.md`):
- HKIE's `retention_years` — no source states a figure (a verified absence, not a search miss); seeded as `NULL` rather than an unsourced default. `accrediting_bodies.retention_years` made nullable specifically for this.

**Resolved 2026-07-09** (citation-grounding + product-policy pass — see vault Decisions Log Q24/Q25 and the respective slice open-question sections):
- Retention windows for 6 of 8 launch bodies (Credit Ledger §8.5, Event Lifecycle §9.5) — per-body citations, 2–6yr verified range, no single default
- Credit Ledger §8.1 (nullable points/hours columns — confirmed sufficient) and §8.3 (`credit_transferred` — deferred, confirmed)
- Event Lifecycle §9.2 (grace window = 24h), §9.3 (credit-and-adjust on open dispute), §9.4 (mandatory cancellation notification, organiser-handled refund)
- Data Model Slice 0.9 §9 — all four items (HKAM hierarchy, HKIE discipline handling, cross-body recognition, superseded-licence aggregation) confirmed as drafted

**Architectural forks — parked doctrine, decide deliberately** (full reasoning in `docs/doctrine.md`, stage into vault Decisions Log when decided):
- **D.1 config-hash fork** — pinned-in-hash vs chained-version-table. Highest-value open decision (determines whether canonical serialization sits on the ledger's hot write path). Lean: chained-version-table. Re-entry: a real body relationship or the 3b review. Nothing config-referencing gets built into `credit_ledger` before this is decided.
- **Evaluator-versioning gap** — verdict reproducibility needs the *evaluator* (code) versioned, not just inputs (rows + config). Named, deferred to first verdict computation.
- **KMS-signing vs RFC 3161** — RFC 3161 TSA is the deferred anchor on record; KMS-signing was never a logged decision, reverted to undecided.
- **Cycle as a first-class entity** — data-model question, untangled from chain scoping; decide when balance-projection needs it.

**Genuinely external — awaiting the body/organiser/practitioner conversation** (not resolvable by grounding or by Ivan alone):
- Per-body PDF audit-response format
- Reviewer workflow SLA
- Cross-body recognition operational rules (the mechanics, not the ledger-level semantics already confirmed above)

**Standing on Ivan** (operational debt, not blocking Sprint 3):
- Singapore Supabase project provisioning (Sprint 1 Task 11) — gates the PDPO Singapore-residency posture before real practitioner PII lands
- ~~Commit backlog push~~ ✅ **DONE 2026-07-10** — all commits pushed to `origin/main` (preflight clean). Push cadence agreed: end of every work session. DR hole closed.

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
| **CPD Sprint 2** | ✅ shipped 2026-07-08 | `withSecurity` wrapper + `require_active_staff` shared gate + D1 audit-authenticity closed (incl. two follow-up anon-grant gaps) + 3 shipped surfaces (self-check-in, staff-scan check-in, event publish) converted to audited definer functions + §4 abuse-tier substrate + attendee OTP capability + report-only CSP/headers; `pnpm test:rls` 59/59, vitest 461\|59 skipped |
| **CPD Sprint 3a** | ✅ shipped 2026-07-10 | Identity/tenancy DDL (`accrediting_bodies`/`organisers`/`practitioner_licences`) + 5-role staff enum + 6 audited licence-mutation functions + 8-body seed data + `credit_ledger` core schema/chain + `record_credit_entry`/`credit_disputes`; `pnpm test:rls` 92/92, vitest 461\|92 skipped |
| **CPD MVP issuance** | ✅ Stages 0–8 all shipped 2026-07-25 | Config-free `award_attendance_credit()` wired into both check-in paths + `reconcile-event.ts` recovery/retroactive path + `freeze_cpd_config_if_credited()` event-config guard, all live-verified; parallel track to Sprint 3b, not a substitute for it |
| **CPD Sprint 3b** | fully scoped (both halves + review script), execution gated | **Governance** outline (`2026-07-09-cpd-sprint-3b-design.md`: reviewer workflow, confirmation, PDF, cross-body) + **engine** outline (`2026-07-10-cpd-sprint-3b-engine-design.md`: versioned body_rules, the deterministic evaluator, issuance, roster, retro-trust model — the previously-missing CPD core) + **review script** (`2026-07-10-cpd-sprint-3b-review-prep.md`: 7 questions, going-in defaults, the Q5-is-behavioural rule). All gate-annotated. **Gated** on the external-voice review (not scheduled) + Q26. Detail-into-SQL happens after the review + Q26, not before. See `docs/plans/roadmap-to-mvp.md`. |

---

## How to keep this current

- The phase that just shipped updates this doc as part of its `docs/plans/handoff_DDMMYYYY.md` close-out.
- "ACTIVE PHASE" rotates to the next phase's design plan.
- "JUST SHIPPED" rotates to what was previously ACTIVE.
- "CARRIED-FORWARD CONSIDERATIONS" gets new items appended; resolved items removed.
- If this file's `Last updated` is more than one phase out of date, treat it as stale and prefer the latest handoff doc in `docs/plans/`.
