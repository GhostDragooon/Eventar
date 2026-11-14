# Project State — Eventar

_One screen. Each handoff REPLACES sections here; never append. Last updated 2026-11-14 from `handoff_20261107-mvp-rewalk-q51-role-rights.md` (seq 16) and git `cddeee5`. Full history to 2026-11-07: `archive/PROJECT_STATE-full-20261107.md` (~53k tokens: grep it, never read it whole). Code map: graphify graph._

## Now
- Stage 10 CLOSED 2026-11-05 (Ivan, Q48). Work follows the Q48 priority order; direction in `2026-11-05-spine-first-strategy.md` (not locked).
- MVP NOT closed. Entry point: `handoff_20261107-mvp-rewalk-q51-role-rights.md` §0 (parent `handoff_20261106-consolidated.md`).
- 2026-11-07 re-walk: no BLOCKER or MAJOR; three MINORs fixed. `origin/main` = `cddeee5` (= HEAD on 2026-11-14). Code last changed at `bdc87c4` (Q51); the two later commits are docs only.
- DB: Seoul (`ap-northeast-2`) is up to date with local through `20261107100000` (dry-run, 2026-11-07). Q49, Q50, Q51 applied and read back there.
- Deploy PAUSED: needs Ivan's explicit go. Prod Singapore (`ap-southeast-1`) is unprovisioned (Stage 8 precondition).

## Waiting on Ivan (recommendation first)
1. **Security card** (Q48 priority 2): M3 no enforced anti-clickjacking header (`frame-ancestors` only in report-only CSP; no `X-Frame-Options`); M2 `consent_records` forgeable by any signed-in user; `zod` 4.4.3 → 4.6.6+. Recommend one card, about half a day. H1 (`auth_email()` confirmed-email check, SQL layer) stays its own kernel card after sign-off.
2. **Agenda blocks:** (a) DB rule: blocks sit inside the event window; (b) `update_event_with_blocks` returns block ids. Recommend one card for both; migration must check existing rows first.
3. **Email stub-vs-real branch** `origin/claude/distracted-haibt-18a25a` (`04fdc9c`, `fb49ac1`, unmerged). Five calls in `handoff_20261031-email-switch-landing.md` §0.
4. **Frontend items** (need before/after shown): phone nav clips Settings at 375px (do first); `AuthBackdropCard` hex gradient and em-dash copy; UX-04 wording; bulk controls for read-only roles.
5. **CLAUDE.md wording:** Hard Rule 1 says "OTP/password+MFA"; code sends an emailed magic link only. Hard Rule 7 ("stubbed regardless of stage") turns false once the email branch merges.
6. Leave unless needed: staff of another org cannot edit event details through the API (pinned in `tests/rls/role_rights_q51.rls.test.ts`).
- **Legal parked** (`docs/DEFERRED.md` TODO row). Send `docs/legal/README.md` solicitor list. Consent strings `tos-0.1-draft`, `pp-0.2-draft` NOT bumped (a bump re-prompts every account).

## Locked decisions (full text: vault Decisions Log)
- **Q20 (2026-07-03):** pivot to CPD/CME/CE event + credit platform, HK launch.
- **Q32 (2026-08-09):** Frontend Design Standard is the authority on colour, wordmark, navigation.
- **Q47 (2026-10-30):** two audiences, two doors, never crossed. Attendee `/account/sign-in`; organiser `/login`.
- **Q48 (2026-11-05):** Stage 10 closed; spine-first priority order.
- **Q49:** audit/evidence hash functions pin `TimeZone=UTC`, `DateStyle=ISO`, `bytea_output=hex` (`20261106100000`).
- **Q50:** every `participation_evidence` delete writes an `evidence_deleted` audit row; chain verifiers are `service_role` only (`20261106110000`).
- **Q51:** admin any org event, member own, `body_admin` and `auditor` read-only, `eventar` all; mixed bulk refused whole (`20261107100000`).
- **Append-only ledgers (Hard Rule 11):** `credit_ledger` and `audit_events` have direct writes revoked from every role including `service_role`. The only write path into `credit_ledger` is `record_credit_entry` (SECURITY DEFINER; `20260709270000`, redefined `20260709310000`). Guard test: `tests/rls/audited_table_writes.rls.test.ts`.
- Sign-in is an emailed magic link (`signInWithOtp` + `/auth/callback`). Hosted Auth: confirm email ON, password signup OFF.

## Boundary rules (Q32/Q47: read before touching nav, redirect or CTA)
- `StaffShell` never links public `/events`; its events surface is `/dashboard`.
- Attendee shells (`SiteShell`, `PublicShell`, `LandingNav`) never point an auth CTA at `/login`. Exception: the landing pill's Organiser door.
- Known defect: `/auth/callback` path-prefix heuristic misroutes organiser sub-routes under `/events/<id>/...` (finding I4, `handoff_20260925-two-persona-review.md`).

## Queued for Claude (no ruling needed)
- Fix the `PublishDraftButton` / `NewEventForm` / `award_f1_f5_gate` flakes only if a gate blocks (`docs/DEFERRED.md`).
- One clean-worktree gate chain on final HEAD before the MVP done-when declaration.
- Local DB drift not deleted: events `ZZ-FINAL admin before-window`, `ZZ-FINAL member c1`; user `prac01@final.invalid`; ~300 RLS-test accrediting bodies; ~63 test users. Clean only on Ivan's go.
- After MVP closes: declare done-when against `mvp/REVIEW-FINAL-summary-r2.md`, update this file and the vault roadmap, run `/graphify --update`.

## Pointers
Stages: `STAGES.md`. DB: `supabase/migrations/` summary in `docs/db/SCHEMA_SUMMARY.md`. Deferred: `docs/DEFERRED.md`. DB cleanup map: `2026-11-05-db-cleanup-dependency-map.md`.
