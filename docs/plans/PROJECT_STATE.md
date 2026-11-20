# Project State — Eventar

_One screen. Each handoff REPLACES sections here; never append. Last updated 2026-11-21 from `handoff_20261120-coherence-m2-nav-auth.md`; earlier 2026-11-15 from `handoff_20261114-mvp-close.md` and git `7ca2e7d` (five MVP-close commits plus a docs commit, pushed to `origin/main` 2026-11-15; the five migrations are applied to Seoul). Full history to 2026-11-07: `archive/PROJECT_STATE-full-20261107.md` (~53k tokens: grep it, never read it whole). Code map: graphify graph._

## Now
- Stage 10 CLOSED 2026-11-05 (Ivan, Q48). Work follows the Q48 priority order; direction in `2026-11-05-spine-first-strategy.md` (not locked).
- **MVP spine CLOSED on `main` (`7ca2e7d`, code gated at `d9ed559`; 2026-11-14 live walk, run 3).** Spine = create, publish, register, check in, record. No BLOCKER, no new MAJOR. Evidence: `mvp/REVIEW-FINAL-summary-r3.md`. Two conditions stay open: M1 (consent copy names Terms and Privacy pages that 404; legal parked) and a full `vitest run` that has not exited 0 (two load flakes, next bullets). Pushed 2026-11-15.
- The MVP-close work is on `origin/main` (`1f3d958` to `7ca2e7d`): `9170554` S1 to S3, `c94eedf` S4, `b5f12a3` S5 and S6, `265991a` S7 and S8, `d9ed559` docs and test repairs, `7ca2e7d` state and flake rows. Previous code commit: `b95a987` (Q51). Details: r3 summary, Decisions Log Q52.
- **Gate chain at `d9ed559` (2026-11-15, detached clean worktree, local stack):** tsc 0; eslint 0 errors and 11 warnings; `check:ui-colours` pass; `check:ui-primitives` 4 old hits in 3 files this work did not touch; em-dash scan 0; `test:rls` 50 files and 483 tests then 5 files and 57, all pass; `next build` 0. **Full `vitest run` with `RLS_TESTS=1` is NOT CLEAN.** Run 1: 2833 of 2833 passed but exit 1 on 3 unhandled errors from `EventsHome.test.tsx` (toast timer after teardown). Run 2: one `PublishDraftButton` test failed (2832 of 2833). The base commit `1f3d958` also failed one `PublishDraftButton` test. Both files pass alone, 63 of 63 three times. Both have rows in `docs/DEFERRED.md`.
- DB: Seoul (`ap-northeast-2`) is up to date with local through `20261114140000` (the five MVP-close migrations applied 2026-11-15 with `supabase db push --linked`; read back read-only: consent writes definer-only, `auth_email()` checks confirmation, 3 deferred window triggers, `update_event_with_blocks` returns jsonb, capacity trigger present). The 4 legacy out-of-window agenda blocks on 2 frozen published events were left as they are.
- **B9 RAG foundation may start (Ivan, 2026-11-16):** Stages 1 and 2 only, in parallel with Stage 8; local models, staff-only, digest later. Plan and agent cards: `2026-08-29-rag-execution-plan.md` → "Revision R2". Decision: vault Q53. **Stage 1 DONE locally 2026-11-16 (cards B9-S1-A, B9-S1-B):** eight `20261117*_rag_*` migrations (15 tables, Hard Rule 11 on seven) applied to the local stack only, NOT to Seoul; Python service skeleton `services/rag_api/` (`/health`, `/whoami`). Gates: tsc 0, eslint 0 errors, vitest 2250 passed, build 0, `test:rls` 564 + 57 passed, pytest 71 passed. Dev-lens and user-lens reviews in `docs/plans/rag/REVIEW-S1-*.md`. Next: Stage 2 (cards B9-S2-A, B9-S2-B; S2-B needs corpus files from Ivan). Open ruling: may a `body_admin` read an organisation-private accreditation letter that names their body (now: no).
- **Frontend coherence pass committed locally (2026-11-21, `handoff_20261120-coherence-m2-nav-auth.md`).** `139d904` (133 files) holds S2, T2, M2, the shared `SiteNav`, bottom-sheet menus, trimmed auth pages, a11y and 44px hit areas. NOT pushed (also `2772610`); push needs Ivan's go naming the SHA. Gates, dev and user reviews and a signed-in backtest all passed. Not observed live: sheet swipe, toast, StepPanel slide, reduced motion, 1280px and dark. Review minors still unapplied. Plan: `2026-11-19-coherence-and-ui-guides-plan.md`.
- Deploy PAUSED: needs Ivan's explicit go. Prod Singapore (`ap-southeast-1`) is unprovisioned (Stage 8 precondition).
- **Email stub-vs-real branch is the explicit post-MVP TODO** (`origin/claude/distracted-haibt-18a25a`, unmerged).

## Waiting on Ivan (recommendation first)
1. **Vitest flakes:** accept the two as debt, or fix them first (next test-hygiene card)? The code is already pushed and applied to Seoul.
2. **F1: DB-level window gate on `speaker_checkins`?** Today only the Server Action refuses; a direct INSERT by any org member succeeds before the window. Recommend yes: one migration like the attendee gate.
3. **M1: consent copy.** Recommend wait for legal (your brief parked it). Reword the sentence only if you want zero open MAJORs.
4. **Deploy** stays PAUSED (needs your explicit go). Seoul already carries the five migrations, so any app build must be the new code.
5. **Frontend items** (need before/after shown): how a phone visitor reaches `/login` (header hides Organiser log in below 640px); landing lost nav anchors; register tap targets 32px; 640px landing overflow; `AuthBackdropCard` hex gradient and em-dash copy; UX-04 wording; bulk controls for read-only roles.
6. **CLAUDE.md wording:** Hard Rule 1 says "OTP/password+MFA"; code sends an emailed magic link only. Hard Rule 7 ("stubbed regardless of stage") turns false once the email branch merges.
7. Leave unless needed: staff of another org cannot edit event details through the API (pinned in `tests/rls/role_rights_q51.rls.test.ts`).
- **Legal parked** (`docs/DEFERRED.md` TODO row). Send `docs/legal/README.md` solicitor list. Consent strings `tos-0.1-draft`, `pp-0.2-draft` NOT bumped (a bump re-prompts every account).

## Locked decisions (full text: vault Decisions Log)
- **Q20 (2026-07-03):** pivot to CPD/CME/CE event + credit platform, HK launch.
- **Q32 (2026-08-09):** Frontend Design Standard is the authority on colour, wordmark, navigation.
- **Q47 (2026-10-30):** two audiences, two doors, never crossed. Attendee `/account/sign-in`; organiser `/login`.
- **Q48 (2026-11-05):** Stage 10 closed; spine-first priority order.
- **Q49:** audit/evidence hash functions pin `TimeZone=UTC`, `DateStyle=ISO`, `bytea_output=hex` (`20261106100000`).
- **Q50:** every `participation_evidence` delete writes an `evidence_deleted` audit row; chain verifiers are `service_role` only (`20261106110000`).
- **Q51:** admin any org event, member own, `body_admin` and `auditor` read-only, `eventar` all; mixed bulk refused whole (`20261107100000`).
- **Q52 (2026-11-14):** a staff identity needs a confirmed account (`app_private.auth_email()` checks `auth.users.email_confirmed_at` and `sub`; kernel K1 sign-off). Also: consent writes definer-only, agenda blocks inside the event window, capacity checked under an event-row lock. Tests that fake JWT claims must carry `sub`.
- **Q53 (2026-11-16):** RAG service is block B9: local open-weight models, `eventar_staff` and `body_admin` only, digest after gate calibration, e-means for any clustering; foundation Stages 1 and 2 may start now.
- **Append-only ledgers (Hard Rule 11):** `credit_ledger` and `audit_events` have direct writes revoked from every role including `service_role`. The only write path into `credit_ledger` is `record_credit_entry` (SECURITY DEFINER; `20260709270000`, redefined `20260709310000`). Guard test: `tests/rls/audited_table_writes.rls.test.ts`. `consent_records` joins the matrix: definer-only, `service_role` keeps DELETE.
- Sign-in is an emailed magic link (`signInWithOtp` + `/auth/callback`). Hosted Auth: confirm email ON, password signup OFF.

## Boundary rules (Q32/Q47: read before touching nav, redirect or CTA)
- `StaffShell` never links public `/events`; its events surface is `/dashboard`.
- Attendee shells (`SiteShell`, `PublicShell`, `LandingNav`) never point an auth CTA at `/login`. Exception: the landing pill's Organiser door.
- Known defect: `/auth/callback` path-prefix heuristic misroutes organiser sub-routes under `/events/<id>/...` (finding I4, `handoff_20260925-two-persona-review.md`).

## Queued for Claude (no ruling needed)
- Flake card: `PublishDraftButton.test.tsx` and `EventsHome.test.tsx` (rows in `docs/DEFERRED.md`). Until fixed, a full `vitest run` is not a clean gate. The MVP-done declaration becomes final when that gate exits 0 (or you accept the flakes as debt) and you rule on M1.
- Fix `scripts/walk-window.sh`: the S5 trigger blocks a plain `update events` on an event with agenda blocks.
- Fold `components/analytics/ExportAnalyticsCsv.tsx` `esc` and the `EventsHome` duplicate into `lib/csv.ts` when next touched. No exploit today.
- `eventar-static-gates` skill: its `PublishDraftButton` note is stale (the cause was a hard-coded date, not contention). The skills tree is peer-managed, so edit it only with that peer idle.
- `pnpm-lock.yaml` re-resolved a few transitives with the zod bump (committed in `9170554`). 6 non-zod audit advisories (build-tool transitives) are untriaged.
- Local DB drift, not deleted: the org has 533 events and `public.users` has 240 rows with no auth row, both from earlier RLS-test runs. `credit_ledger` is 920 rows (it was 889; the gates and the walk wrote the rest; append-only, local only).
- Graphs refreshed 2026-11-17: repo graph at `dcbc3ad` (code-only AST merge, committed); vault graph refreshed (not a git repo). Changed docs (72, mostly peer skill files) still wait for one semantic `/graphify --update`. Do not run bare `graphify update .`: it collapses INFERRED edges.

## Pointers
Latest handoff: `handoff_20261120-coherence-m2-nav-auth.md` (S2/T2/M2 applied, nav, auth, pill); before it `handoff_20261119-coherence-ui-guides.md`, then `handoff_20261116-b9-stage1.md` (B9 Stage 1) and `handoff_20261114-mvp-close.md`. Walk evidence: `mvp/REVIEW-FINAL-summary-r3.md` plus four lens files. Stages: `STAGES.md`. DB: `supabase/migrations/` summary in `docs/db/SCHEMA_SUMMARY.md`. Deferred: `docs/DEFERRED.md`. DB cleanup map: `2026-11-05-db-cleanup-dependency-map.md`.
