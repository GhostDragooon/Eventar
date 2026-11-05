# Handoff, 2026-11-05: Q48 spine-first direction logged, rule-content audit live on Seoul, legal drafts parked; next is finishing the MVP

**Date:** 2026-11-05
**Status:** IN PROGRESS. The MVP is NOT closed. Ivan's ruling at the end of this session: "flag the legal part as to do, handoff, we'll finish up the MVP 1st". Everything below §0 is committed and pushed except this handoff, the `PROJECT_STATE.md` correction, the `DEFERRED.md` legal row and the strategy-doc M3 correction (see "Files Changed").
**Bead(s):** none (the repo does not use `bd`)
**Chain:** `mvp-execution` seq `15`
**Parent:** `handoff_20261103-mvp-execution-14.md`
**Prior chain:** `handoff_20261031-mvp-execution-4.md` > … > `handoff_20261101-mvp-execution-13.md` > `handoff_20261103-mvp-execution-14.md` > this
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first; frontend items need the before/after shown, standing rule 2026-10-14)
1. **Seq 14 Decide 4, still unruled: agenda-block DB rule.** (a) a DB rule that agenda blocks sit inside the event window (dev m6, backtest MINOR-1; touches `update_event_with_blocks` and existing rows; Hard rule 8 says form, Zod and DB); (b) block ids read back by position after a save (dev m4; needs `update_event_with_blocks` to return ids). **Recommend:** one card doing both, after the security items below. Cost: a migration that must check existing rows before adding the constraint.
2. **Seq 14 Decide 5, carried, still unruled:**
   - the three UX-04 design items (Account tag on linked rows + wording of the next step; "No matches." copy and cancelled-registrant counts that disagree across Details, Check-in and Pass delivery; the 320 px layout). These are design decisions: they run Ivan's locked frontend pipeline.
   - role rights: the role RPCs accept only the creator or Eventar staff while contact edit is org-wide; an `organiser_member` who is not the creator can publish; a stale comment says owner-only at `app/events/[id]/edit/actions.ts:25`.
   - the email stub-vs-real branch `origin/claude/distracted-haibt-18a25a`.
   - seq 8 Decide 1 and 3, and the five-ruling list in seq 12 §0.
   **Recommend:** role rights first (a correctness/security item), then UX-04 via the pipeline, then the email branch.
3. **Security (Q48 priority 2), from `docs/plans/security-audit-20261104.md` "Still open":**
   - **M3 clickjacking is OPEN, not done.** `frame-ancestors 'none'` (`next.config.ts:14`) sits only in `Content-Security-Policy-Report-Only` (`next.config.ts:39`); browsers do not enforce report-only, and `frame-ancestors` is ignored there. No `X-Frame-Options` header exists [X: grep]. The Q48 strategy doc said this was done; corrected this session. **Recommend:** add `X-Frame-Options: DENY` (one header, no CSP risk) now; enforcing CSP later.
   - H1 SQL layer: `app_private.auth_email()` confirmed-email check (kernel sign-off needed).
   - M2: `consent_records` writable/forgeable by any signed-in user.
   - `zod` 4.4.3 installed [X] → 4.6.6+ (the one remaining direct high advisory).
   **Recommend:** M3 header + M2 + zod as one security card; H1 SQL as its own card after your sign-off.
4. **CLAUDE.md hard rule 1 wording is wrong about sign-in.** It says auth is "native Supabase OTP/password+MFA, not magic link". The code sends an emailed sign-in link: `signInWithOtp` with `emailRedirectTo` → `/auth/callback` → `exchangeCodeForSession` (`app/login/actions.ts:29`, `app/account/sign-in/actions.ts:45`, `app/auth/callback/route.ts:55`) [R]. No password path, no MFA [R]. Staff TOTP is Stage 11. **Recommend:** let Claude correct the sentence (rule unchanged, only the description). Same stale claim sits in the project skill `eventar-legal-terms-privacy-drafting` (it says the v0.2 draft's "magic-link login" was wrong; it was right).
5. **Peer doc decisions (not this session's work):** `docs/plans/2026-11-05-db-cleanup-dependency-map.md` §0 (commit `885b72d`, session "Database organization review") asks you to rule on the audit/evidence hash chains depending on session time zone, legacy accreditation columns, squash timing. Read its §0 when you get to DB tidy.

**Execute** (only Ivan, in order)
1. **Hosted Supabase Auth dashboard:** confirm "Confirm email" is ON and password signup is closed (security audit Decision 1; decides whether H1 is live on Seoul). Claude cannot see hosted Auth settings and must not use the Supabase MCP.
2. Say "commit" (and "push" — push go is per session) for this handoff and the four doc edits listed in "Files Changed".
3. **Legal: parked.** When the MVP is closed, send the "Requires a Hong Kong solicitor" list in `docs/legal/README.md` to a solicitor. Tracked as the TODO row at the end of `docs/DEFERRED.md`.

**Queued for Claude** (no ruling needed; carried from seq 14 unless marked new)
- Re-walk live the fixes that were only unit-tested in seq 14: agenda error banner (names the block and cause), "Still needed to continue: …" list on New event, wizard "why Continue is disabled" hint and `*` marks, Sign up keeping `next`, filter-aware empty copy on Registrations, Settings Team card for a member. Plus the seq-14 Decide 1–3 changes that landed after seq 14 (`6799639`, `a93d25d`): wizard Done without a licence + missing-licence banner; speaker check-in window; reworded consent line.
- Run the two rows not walked in seq 14: `ux-member` steps 2–4 (create draft, agenda, publish) and `ux-body` step 2.
- `StatusPill` still labels drafts "Drafted" (`components/lifecycle/StatusPill.tsx:21`, still present at HEAD [X]); fix label + `StatusPill.test.tsx` together, then delete the draft branch of `components/dashboard/StatusChip.tsx`. (This is a seq-14 MAJOR fix list item; check it is mechanical — matching an existing label — before treating it as no-pipeline.)
- Fix the tip-gate script's `rg` call (carried from seq 12); record the `PublishDraftButton.test.tsx` flake as one debt item (skill `eventar-static-gates`). This session saw that flake again: full vitest 2199 passed / 1 failed, the file passed 12/12 twice in isolation [X].
- Run the gate chain in a clean detached worktree at final HEAD (never done for the MVP fix wave).
- Clean local fixtures left by the walks (skill `eventar-fixture-leak-cleanup`).
- After the MVP items close: write the MVP done-when declaration against `docs/plans/mvp/REVIEW-FINAL-summary-r2.md`, update `PROJECT_STATE.md`, vault roadmap note + Decisions Log entries Ivan approves, then `/graphify --update`.

**Other sessions:** `ListAgents` at handoff time: one peer, "Database organization review [d10f8c]", interactive, idle, started 9h ago. It wrote `docs/plans/2026-11-05-db-cleanup-dependency-map.md` (`885b72d`) and read Seoul read-only through the Supabase MCP with Ivan's go. Untracked `docs/plans/security-audit-20261104.md` is a peer's file (not this session's); it was not committed here.

---

## Since Last Handoff

- Seq 14 left three product decisions (Decide 1–3). All three were ruled and built by another session on 2026-11-04 before this one started: `6799639` (Decide 1, wizard Done without a licence), `a93d25d` (Decide 2 speaker window + Decide 3 consent wording "will be published before launch").
- A security audit ran on 2026-11-04 (`docs/plans/security-audit-20261104.md`, untracked) and three fixes landed: `0ed292c` (H1 app layer: unconfirmed email is not staff), `4396d28` (M1 `bulk_update_event_status` role gate, EXECUTE service_role only), `73361e3` (H2 next 16.4.5, M8 shadcn to dev deps).
- Seq 14 Decide 4 and 5 were not ruled. Seq 14's whole "Queued for Claude" list is still open (StatusPill "Drafted" verified still present).
- This session did NOT do MVP execution work. It reviewed a strategy note from Ivan, logged it as Decisions Log **Q48** (direction), fixed one breaker in the DB, pushed 19 migrations to Seoul on Ivan's go, decided Q48 §7, and rewrote the legal drafts. Then Ivan parked legal and set the MVP as next.
- Trajectory: the MVP is the next priority again (Q48 §5 priority 1 = close the MVP).

## Reference Documents

- `CLAUDE.md` (repo) and `AGENTS.md` (Next 16). Hard rule 1's auth wording is wrong (§0 Decide 4).
- `docs/plans/STAGES.md` — stage authority. Stage 10 now closed (Q48); B9/B7 in Stage 12; Stage 11 before pilot.
- `docs/plans/2026-11-05-spine-first-strategy.md` — the Q48 direction doc (§2 product shape, §5 priorities, §6 Jev, §7 decided, §7a breakers).
- `docs/plans/2026-10-11-mvp-execution-plan.md` §8 (acceptance walk) and §1.
- `docs/plans/mvp/REVIEW-FINAL-summary-r2.md` — checklist authority for MVP rows.
- `docs/plans/security-audit-20261104.md` (untracked, peer) — "Still open" list drives §0 Decide 3.
- `docs/legal/README.md` — legal publication blockers.
- `docs/DEFERRED.md` — Q48 breakers 2–5, Jev row, legal TODO row (last four/five rows).
- Vault: `02 — Decisions Log.md` Q48; `00 — Index.md` Q48 callout.

## The Goal

Close the MVP formally (Q48 priority 1): spine + both personas working, acceptance criteria met, the remaining seq-14 items done, then a done-when declaration Ivan signs. After that: verify/close the security set (priority 2), then Stage 8 deploy (priority 3), then the first partner accreditation slice (priority 4). Legal pages are parked until the MVP is closed and must be published before Stage 8.

## Where We Are

- `origin/main` = local `main` = `b027154` at the time of writing [X]. Seoul migrations = local = 162 versions, newest `20261105100000` [X: `supabase db push --linked --dry-run` → "Remote database is up to date"].
- **Q48 logged** across repo + vault: strategy doc, `PROJECT_STATE.md`, `STAGES.md` (rows 10 and 12 edited in place, reading note), `DEFERRED.md` (breakers 2–5, Jev), `BLOCK-ARCHITECTURE.md` (B2/B7/B9), vault Decisions Log Q48 + Index.
- **Q48 §7 decided by Ivan (AskUserQuestion):** (a) close Stage 10, B9 digest + B7 QC engines into Stage 12 per partner slice; Stage 11 stays before pilot; Jev skipped for now.
- **Breaker 1 fixed:** migration `20261105100000_accrediting_body_rule_content_audit.sql` — trigger on `accrediting_bodies` writes `body_rule_content_changed` audit rows (old/new `category_taxonomy` + `cycle_config`, sha256 of each) plus one `body_rule_content_baseline` row per body. Applied local and Seoul.
- Local baseline rows: 334 bodies (local DB has many fixture bodies) [X].
- Test `tests/rls/accrediting_body_rule_audit.rls.test.ts`: 5/5 pass, failed before the migration [X].
- Grant guards + audit-chain suites: 95/95 [X].
- Gates at that point: tsc pass, eslint 0 errors (10 warnings), `next build` pass, vitest 2199 pass / 1 flaky fail (`PublishDraftButton.test.tsx`, unrelated) [X].
- **19 migrations pushed to Seoul** on Ivan's explicit "Push all 19" (`20261002000000` → `20261105100000`). Only NOTICEs were `drop … if exists` skips [X].
- **Legal drafts rewritten** (`b027154`): Privacy Policy draft 0.3, Terms of Service draft 0.2, README with blockers. Consent strings unchanged (`tos-0.1-draft`, `pp-0.2-draft`).
- **Legal parked** as a `DEFERRED.md` TODO row (uncommitted).
- **PROJECT_STATE MVP overclaim corrected** (uncommitted): the earlier entry said "MVP signed off"; now says NOT closed.
- **Strategy doc M3 claim corrected** (uncommitted): clickjacking listed as open.
- No MVP code was changed this session.
- No dev server is running on :3000/:3100/:3200 [X: lsof empty].

## What We Tried (Chronological)

1. **Strategy note review.** Ivan pasted a strategy note (spine as product; accreditation partner-led; deterministic award; LLM digest only for Board Pack authoring; Jev narrow QC engines; priorities). Reviewed against repo. Ivan: revise "soft gates"; validate LLM/Jev/Board Pack before writing; "Stage 10 is essentially LLM+JEV build"; confirmer is "me before anyone else", then "Both" (confirm before an event can award, and after posting).
2. **Stage 10 check.** Ivan asked "what about stage 10 is built? those rules are seeded but they are static, am i wrong?" Answer: machinery shipped (schema, C4 engine, C5 wizard, export, prior-approval advisory, role_award_rule); rule content only for HKCP + MCHK; 15 HKAM Colleges registry-only. He was right that rules are static; Stage 10 is not the LLM+Jev build.
3. **Jev assessment** from 4 public URLs Ivan gave: hosted closed-weight decision API (`POST …/v1/systemone`), cannot run offline, thin GitHub footprint (14 repos same day), conflicts with ADR-0003 unless optional-advisory. Not decided then; skipped later.
4. **Breakers.** Five ways the direction would break were listed. Ivan: "1 fix that 2-5 not an issue at this stage". Breaker 1 = rule content had no history.
5. **Migration attempt 1:** trigger with a WHEN clause referencing `tg_op` → `ERROR: column "tg_op" does not exist`. Fix: moved the no-op filter into the function body (WHEN cannot name OLD on INSERT).
6. **Replay-rollback** (skill `eventar-migration-replay-rollback`) then `supabase migration up --local`. Self-checks in the file: no API-role EXECUTE, trigger exists, baseline count ≥ body count.
7. **Reviews:** dev review (header limits: service_role can forge via `write_audit_event`; DELETE not audited; rollback must name all three objects) and cold-read doc review (locked-vs-built misreads, single Jev/ADR phrasing, exception to "audit insert last" stated) — all applied.
8. **Commit `a26e1ff`** via temp `GIT_INDEX_FILE` (peer `.claude/skills` changes untouched); pushed on Ivan's "Push it".
9. **Seoul.** Ivan: "Apply to Seoul". Dry run showed **19** pending, not 1. Stopped and asked. Ivan: "Push all 19". Pushed. Docs updated (`6bba7cf`).
10. **Q48 §7** via AskUserQuestion → decisions written to STAGES/strategy/BLOCK/DEFERRED/PROJECT_STATE/vault (`be83b24`).
11. **Push collision:** a peer committed `885b72d` (DB cleanup map) on local `main` between my commit and push; `git push origin main` carried it. Ivan: "not contradicting then keep it" — verified no contradiction, kept. **Lesson applied afterwards:** push the exact SHA (`git push origin <sha>:refs/heads/main`), never the branch name, when peers share the tree.
12. **Legal research:** Ivan asked for "real template from real platforms/company". A research agent fetched Luma terms/privacy, Accredible privacy (updated 2026-11-04), HKAM privacy, Eventbrite legal hub (ToS/privacy pages 403), PCPD PICS/PPS guidance via a CityU mirror. Klook/HKTDC/Cyberport failed.
13. **Drafting** (skill `eventar-legal-terms-privacy-drafting`): rebuilt inventory from schema. Found and fixed own overclaims before review: sign-in (it's a magic link, no password/MFA), account closing (no self-serve), profile tables missing from inventory.
14. **Cold-read review** of drafts found 11 issues (all applied): phone + 5 profile fields are required (`lib/accountCompleteness.ts:98-110`); audit payloads hold plaintext email (`registration_claimed` 361 local rows, `registration_contact_updated` 8); avatars bucket is public; `device_metadata` always `{}` (590 rows); `participation_evidence` keeps service_role DELETE; no purge job; schema data missing (survey responses, credit disputes, speaker names, organiser contacts, IP in rate_limits); Nominatim transferee; ToS 7.4 vs 10.3 contradiction; QR "invalid" overclaim; credit only on staff check-in.
15. **Commit `b027154`** pushed by exact SHA.
16. **Handoff:** Ivan: "flag the legal part as to do, handoff, we'll finish up the MVP 1st".

## Key Decisions

- **Q48 is DIRECTION, not locked** (Ivan: "not carving it in stone but a direction we're heading"). STAGES.md stays the authority.
- **Rule-content history, not versioning.** Audit rows with old/new + hashes; real `body_rules` versioning stays Stage 13 (Q26, D.1). Rejected: pack id on `credit_ledger` now (2026-08-21 decision keeps hash at export time).
- **Accepted exception to "audit insert last"** for the trigger: body edits are rare migration/admin ops, never on a request path.
- **Breakers 2–5 deferred** with re-entry triggers in DEFERRED.md (pre-approval gate must live inside `award_attendance_credit()`; Ivan's confirmations recorded as `body_confirmed`; per-event bulk confirm; authorisation without rule content).
- **Stage 10 closed; B9/B7 → Stage 12; Stage 11 before pilot; Jev skipped** (Ivan, 2026-11-05).
- **All 19 migrations pushed to Seoul** rather than holding for Stage 8 (Ivan overrode my "hold" recommendation).
- **Consent version strings NOT bumped** for the legal redraft: `lib/accountCompleteness.ts:119` requires an exact version match, so a bump re-prompts all accounts (381 locally).
- **Legal parked** until the MVP closes; must publish before Stage 8.

## Evidence & Data

### Commits this session (all pushed)

| SHA | Summary |
|---|---|
| `a26e1ff` | feat(registry): audit accrediting-body rule content; log Q48 spine-first direction (7 files, +406/−4) |
| `6bba7cf` | docs(q48): rule-content audit migration now applied to Seoul |
| `be83b24` | docs(q48): close Stage 10; B9 digest and B7 QC engines into Stage 12; skip Jev |
| `885b72d` | (peer, carried by my push, kept by Ivan) docs(db): DB cleanup dependency map |
| `b027154` | docs(legal): CPD rewrite of Terms (draft 0.2) and Privacy Policy (draft 0.3) |

### Seoul push (2026-11-05, ~08:25 HKT)

| Range | Count | Result |
|---|---|---|
| `20261002000000_create_event_forwards_actor_to_publish` → `20261105100000_accrediting_body_rule_content_audit` | 19 | all applied; remote up to date; 162 versions both sides |

NOTICEs (harmless `if exists` skips): `dsr_staff_read` policy, triggers `events_draft_only_detail_edits`, `agenda_blocks_draft_only_writes`, function `update_registration_contact(uuid,text,text,uuid)`, trigger `accrediting_bodies_rule_content_audit`.

### Gates (rule-content migration change)

| Gate | Result |
|---|---|
| tsc | pass |
| eslint | 0 errors, 10 warnings |
| vitest full | 2199 pass, 1 fail (`PublishDraftButton.test.tsx`; 12/12 twice in isolation) |
| next build | pass |
| new RLS test | 5/5, failed first |
| grant guards + audit chain | 95/95 |

### Consent records (local)

| consent_type | version | rows |
|---|---|---|
| terms_of_service | tos-0.1-draft | 381 |
| privacy_policy | pp-0.2-draft | 380 |

### Legal review findings vs evidence

| Finding | Evidence |
|---|---|
| Required fields | `lib/accountCompleteness.ts:98-110` requires first/last name, phone, workplace, position, profession, specialty, department |
| Plaintext email in audit | `registration_claimed` 361 rows, `registration_contact_updated` 8 rows (local) |
| Public avatars | bucket `avatars` `public = t`; `app/account/actions.ts:879` `getPublicUrl` |
| Device metadata | 590 `participation_evidence` rows, all `device_metadata = '{}'` |
| Partial erasure | `pseudonymise_user` updates only `users.full_name`, `pseudonymised_at`, `deleted_at` |
| Credit only on staff check-in | `app/events/[id]/checkin/actions.ts:185` calls `award_attendance_credit`; self check-in does not |
| Nominatim | `components/VenueSearchBox.tsx` → `lib/nominatim.ts`, client-side |

### Security status check (this session)

| Item | State |
|---|---|
| H1 app layer | closed (`0ed292c`) |
| H1 SQL layer | open |
| M1 | closed (`4396d28`) |
| H2 next | 16.4.5 (`73361e3`) |
| M2 consent_records | open |
| M3 clickjacking | **open** — report-only CSP only, no X-Frame-Options [X] |
| zod | 4.4.3 installed [X], open |
| Hosted Auth confirm-email | unknown, Ivan to check |

## Code Analysis

- `app_private.body_rule_content_hash(jsonb, jsonb)` — immutable SQL, sha256 of `jsonb_build_object('category_taxonomy',…,'cycle_config',…)::text`; jsonb text is canonical so equal content hashes equal.
- `app_private.audit_body_rule_content()` — SECURITY DEFINER trigger fn; skips UPDATE when both columns `is not distinct from`; actor from `request.jwt.claims` `sub`/`role`, else `session_user`. EXECUTE revoked from public/anon/authenticated/service_role.
- Trigger `accrediting_bodies_rule_content_audit` — `after insert or update of category_taxonomy, cycle_config … for each row`.
- `public.write_audit_event(p_event_type, p_actor_user_id, p_actor_role, p_organisation_id, p_subject_type, p_subject_id, p_payload)` — definer owned by audit_writer; EXECUTE service_role yes, authenticated no.
- `lib/legalVersions.ts` — `LEGAL_VERSIONS = { terms_of_service: 'tos-0.1-draft', privacy_policy: 'pp-0.2-draft' }`; used by `app/account/complete/actions.ts:58,64` and `lib/accountCompleteness.ts:119` (exact-match gate).
- `pseudonymise_user(p_user_id, p_reason)` — eventar_staff only, reason required, `ERASED-<12 hex>`, audit event last.
- `next.config.ts` — CSP is report-only (`:39`); `frame-ancestors 'none'` at `:14` inside it.
- Sign-in — `signInWithOtp` + `emailRedirectTo` (magic link), callback `exchangeCodeForSession`.

## Files Changed

### Migrations / tests (committed `a26e1ff`)
- `supabase/migrations/20261105100000_accrediting_body_rule_content_audit.sql` — rule-content audit trigger, hash fn, baseline, self-checks.
- `tests/rls/accrediting_body_rule_audit.rls.test.ts` — 5 cases (insert, non-rule change, same-value update, change with chained hashes, chain verifies).

### Docs (committed)
- `docs/plans/2026-11-05-spine-first-strategy.md` — Q48 direction doc.
- `docs/plans/STAGES.md` — rows 10 (closed) and 12 (B9/B7 per slice), Q48 note.
- `docs/architecture/BLOCK-ARCHITECTURE.md` — B2/B7/B9.
- `docs/DEFERRED.md` — Q48 breakers 2–5, Jev row.
- `docs/plans/PROJECT_STATE.md` — Q48 entry, legal entry.
- `docs/legal/privacy-policy.md`, `docs/legal/terms-and-conditions.md`, `docs/legal/README.md`.

### Uncommitted at handoff (this session's)
- `docs/plans/handoff_20261105-mvp-execution-15.md` — this file.
- `docs/plans/PROJECT_STATE.md` — MVP overclaim corrected + pointer to this handoff.
- `docs/DEFERRED.md` — legal TODO row.
- `docs/plans/2026-11-05-spine-first-strategy.md` — §5 M3 correction.

### Vault (outside repo, not in git here)
- `02 — Decisions Log.md` Q48 (incl. "Decided same day"); `00 — Index.md` Q48 callout.

## User Feedback & Preferences (REQUIRED — never omit)

- "review & validate before writing it into the md" — validate concepts before they enter docs.
- "not carving it in stone but a direction we're heading" — label directions DIRECTION, not locked.
- "me before anyone else" then "Both" — Ivan confirms first, before award and after posting.
- "1 fix that 2-5 not an issue at this stage" — defer with re-entry triggers, don't drop.
- "Push all 19" — Ivan chose to push all pending migrations to Seoul over my hold recommendation.
- "not contradicting then keep it" — conditional approvals: verify the condition, then act.
- "do your research and find some real template from real platforms/company" — structure from real sources, never copied text.
- "flag the legal part as to do, handoff, we'll finish up the MVP 1st" — MVP before legal.
- Push go is per session and per change; ask each time (memory `push-go-does-not-carry-across-sessions`).

## Where We're Going

1. Ivan: hosted Auth dashboard check (§0 Execute 1).
2. Security card: M3 `X-Frame-Options: DENY`, M2 consent_records writes, zod bump (after Ivan's go).
3. Seq 14 queued items: StatusPill "Drafted", live re-walks, two unwalked rows, tip-gate `rg`, flake debt, fixtures.
4. Ivan rulings: Decide 1 (agenda rule), Decide 2 (role rights, UX-04, email branch); build them.
5. Clean-worktree gate run at final HEAD; MVP done-when declaration; Ivan signs.
6. Then legal (DEFERRED TODO row) and Stage 8.

## Risks & Blockers

- **Peers share the tree and `main`.** Push by exact SHA; commit via temp index; `git status` before staging.
- **Seoul now carries every migration**, including October hardening; the live :3000 (`pnpm dev`) app hits them. Watch for behaviour changes reported from Seoul-backed use.
- **PublishDraftButton flake** can fail a full vitest run; rerun the file in isolation before blaming a change.
- **Hosted Auth unknown** — if Confirm email is off, H1 is live on Seoul until the SQL layer closes.

## Open Questions

- Does "Confirm email" sit ON in hosted Auth?
- Is the M3 fix an `X-Frame-Options` header or a move to enforcing CSP?
- Should CLAUDE.md hard rule 1's auth description be corrected (and the drafting skill)?

## Q48 detail (what the direction actually says)

- **Spine = B1:** create → publish → register → check-in / roster → post-event record.
- **Accreditation module** (B2, B3, College export) sits on top; not a live rule engine at launch.
- **Two confirmations, Ivan first:** (1) before an accredited event can award credit — a new state on the event's CPD config, audit row last — **not built**; (2) after posting via `confirm_credit_entry()` (`body_confirmed` tier, `require_active_staff('body_admin','eventar_staff')`) — function exists, **review queue UI not built**.
- **"Live" body for an organiser** = has `category_taxonomy.role_mappings` AND an active `organisation_body_authorisations` row (picker `lib/cpd/authorisedBodies.ts` filters on it).
- **Priorities (§5):** 1 close MVP; 2 security (verify/close); 3 Stage 8; 4 partner outreach → first accreditation slice.
- **Non-goals:** rule content for bodies with no partner; any LLM/QC engine on the award path; every College pack up front; a general reasoning layer.
- **Jev blocks if it returns:** hard rule 7; ADR-0003 (optional advisory step only unless amended); no PII leaves; vendor/terms review.

### Breakers (strategy doc §7a)

| # | Breaker | Status | Re-entry trigger |
|---|---|---|---|
| 1 | Rule content had no history | FIXED (`20261105100000`) | — |
| 2 | "Ivan approves first" gate only safe inside `award_attendance_credit()` (credit posts at check-in, ledger append-only) | Deferred | when the approval step is built |
| 3 | Ivan's confirmations recorded as `body_confirmed` | Deferred | before any confirmed row appears in a College export |
| 4 | One confirmer, per-row (~13 rows/attendee on multi-body) | Deferred | first multi-body accredited event |
| 5 | Authorisation possible for a body with no rule content | Deferred | first authorisation for a body other than HKCP/MCHK |

## Legal research sources (structure only, no text copied)

| Source | Fetched? | Used for |
|---|---|---|
| Eventbrite legal hub `eventbrite.com/l/legalterms/` | hub yes; ToS/privacy 403 | document split: consumer ToS / organiser agreement / DPA / sub-processor list |
| Luma `luma.com/terms`, `luma.com/privacy-policy` | yes | "our role in events", acceptable use, liability shape; privacy as anti-model (no roles, no cross-border) |
| Accredible `accredible.com/privacy-policy` (updated 2026-11-04) | yes | audience-split structure; processor for issuer data |
| HKAM `hkam.org.hk/en/node/66` | yes | HK PDPO shape; DAR to CEO; English prevails; CME data goes to Colleges/MCHK |
| PCPD PICS/PPS guidance (2013) | via CityU mirror | the five DPP1(3) items; PPS contents |
| PCPD Recommended Model Contractual Clauses (2022) | snippets | cross-border section (s33 not in force) |
| PCPD data breach guidance (2023) | snippets | voluntary notification |
| Klook, HKTDC, Cyberport, HKGGA | failed | — |

### PCPD checklist coverage in Privacy draft 0.3

| Item | Where |
|---|---|
| Obligatory vs voluntary + consequence (DPP1(3)(a)) | §5 (fixed after review: phone + 5 profile fields required) |
| Purposes | §4 |
| Transferee classes | §6 (Organiser, accrediting body, Supabase, Resend, hosting, Nominatim, authorities) |
| Access/correction rights | §10 + collection notice |
| Request handler title + address | §15 + collection notice (address added after review) |
| DAR 40 days, non-excessive fee, OPS003 | §10 |
| Part 6A direct marketing | §12 |
| Cross-border | §7 |
| Retention | §8 (periods bracketed; no purge job) |
| Cookies | §11 |
| Children | §13 |

## Gotchas hit this session

- **Review-agent dispatch blocked by the `review-budget-gate` hook** until the prompt carried a `Budget: max N tool calls; scope …; report partial findings at the cap.` line.
- **psql:** `pg_get_functiondef` inside an aggregate query errored ("array_agg is an aggregate"); searching `prosrc` worked.
- **zsh:** `grep --include=*.tsx` unquoted → `no matches found` (zsh globs the flag). Quote it or drop it.
- **BSD sed:** `sed '1,/^---$/{…!d}'` → "extra characters at the end of d command"; use awk.
- **Trigger WHEN** cannot name `tg_op`/OLD for INSERT; filter in the function body.
- **`git push origin main` with peers active** can carry a peer's commit; push `<sha>:refs/heads/main`.
- **Docs drift found:** `BLOCK-ARCHITECTURE.md` B9 row cites "(Q41)", but vault Q41 is the core-UX design round — pre-existing, not fixed, flag only.

## Quick Start for Next Session

```bash
cd /Users/ivan/Eventar
git fetch -q origin && git log --oneline -6 && git status -s | head
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '
```

**First action:** ask Ivan for the hosted Auth result (§0 Execute 1) and his ruling on §0 Decide 3 (security card); while waiting, fix the `StatusPill` "Drafted" label + its test (queued item, `components/lifecycle/StatusPill.tsx:21`).

Read first:
- this file §0
- `docs/plans/handoff_20261103-mvp-execution-14.md` §0 and "Where We Are" (the queued list's detail)
- `docs/plans/mvp/REVIEW-FINAL-summary-r2.md`
- `docs/plans/security-audit-20261104.md` "Still open"
- `docs/plans/PROJECT_STATE.md` top entries
