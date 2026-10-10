# Session handoff, 2026-10-10: cross-organisation reads closed. People's data and the audit log are readable by the person and the platform operator only; staff by their own organisation's admins; `is_manager()` is gone

Written after the phase-completion protocol (a dev-lens and a separate user-lens review, a backtest). Evidence tags: **[X]** executed, **[R]** read in code or the catalog, **[I]** inferred, not reproduced. Decision record: vault Decisions Log **Q43**. Follows `handoff_20261010-dsr-org-scope.md` (Q42), which registered this finding.

## 1. State: LOCAL ONLY, NOTHING COMMITTED OR PUSHED

- Migration `20261010083221_cross_org_read_scope.sql` is applied to the **local** stack only. The hosted Seoul project **presumably still has the hole** [I: its MCP credentials are stale]. Seoul receives migrations only through Ivan's own `supabase db push --linked`.
- The push set is now **five local-only migrations**: `20261002000000`, `20261002010000` (P2a session), `20261009011823` (cross-org peer), `20261010000725` (DSR) and this one. One `db push --linked` pushes all of them in timestamp order; decide the set together. This migration needs `20261010000725` first (that one drops `dsr_staff_all`, the other former user of `is_manager()`); its `DROP FUNCTION` has **no CASCADE**, so a hosted dependent that no migration here knows about makes the push fail and apply nothing.
- Files that are mine: `supabase/migrations/20261010083221_cross_org_read_scope.sql` (135 lines), `tests/rls/cross_org_read_scope.rls.test.ts` (30 tests), this file. Doc hunks I added to files **shared with the DSR session** (its uncommitted hunks are in the same files): `docs/DEFERRED.md`, `docs/plans/role-split-inventory.md`, and `docs/ops/erasure-and-dsr.md` (untracked, the DSR session's; mine is one sentence in step 4 and one bullet in the organiser-admin section). Vault, not git: `02 — Decisions Log.md` (Q43, plus a back-reference in Q42), `10 — Architecture/Data Model.md` (a superseded callout).
- **Commit plan if asked.** Stage explicit paths only; use the temporary-index recipe from the memory note `commit-around-peer-staged-files` (another session has `docs/plans/2026-10-02-g1-ground-tokens.md` staged). Easiest order: commit the DSR session's set first (its handoff section 1 lists it); then mine is a clean follow-up and the three shared docs contain only my hunks. If mine goes first, build the three shared files as `HEAD` plus only my hunks.
- `PROJECT_STATE.md` was **not** edited (it carries another session's uncommitted entry). Suggested pointer: *"2026-10-10 cross-org reads: people's data and the audit log are self + platform operator only, staff is own organisation (never operator rows), `is_manager()` dropped. Migration `20261010083221` (local only). See handoff_20261010-cross-org-read-scope.md and vault Q43."*
- The dev server I started for the user-lens (`eventar-noreview`, :3100) has been stopped. Nothing else is left running.

## 2. What was decided (Ivan, 2026-10-10, AskUserQuestion on an investigated case)

1. **People's data** (`users`, `consent_records`, `professional_profiles`, `society_memberships`, `additional_appointments`): the person (where a self policy exists) and the platform operator only. Rejected: "registrants at my organisation" (it keys on the link Q42 showed an organisation can manufacture, hands over whole rows, and has no consumer today).
2. **`audit_events`**: platform operator only. Rejected: operator plus admins of the row's organisation (every future event type's payload would be tenant-visible by default).
3. **`app_private.is_manager()` is dropped.**

Applied by me without a question, because the evidence left no real choice: `staff` is readable by its owner, the operator, and an active `organiser_admin` of **that row's** organisation (`app_private.is_org_admin(uuid)`), because `/settings/team` is the only organiser screen that reads other people's staff rows.

**Applied by me after the reviews, for Ivan to veto (one line to revert):** that org-admin branch **excludes `eventar_staff` rows** (`role <> 'eventar_staff'`). The user-lens showed an operator row placed in a tenant's organisation was visible to that tenant's admins, and the documented first-operator bootstrap (`supabase/seed.sql`) puts the operator in `default`. This turned an operational rule ("operators must not share an organisation with tenant admins") into a structural guarantee, which `DECISION_PROTOCOL.md` section 3.3 ranks above a rule. It is a refinement of decision 2 in the same direction (narrower), with no consumer affected.

## 3. The finding, and what the investigation added

- **Executed 2026-10-10 [X], as an org-A admin with no data of their own:** `users` 180/180, `audit_events` 6,665/6,665 (3,104 other organisations' + 3,561 with no organisation), `staff` 62/62 (including the 5 operators), `consent_records` 149/149, `professional_profiles` 75/75; `society_memberships` and `additional_appointments` returned both fixture rows (the brief had them by policy text only). A member, body_admin and auditor read only their own staff row.
- **Provenance [R]:** `users_staff_read` (2026-07-04, single-organisation era); every later policy was copied from it ("mirrors users_staff_read") with no consumer named.
- **Consumers [R, swept twice, independently by the dev-lens]:** through a user session only the person reads their own rows (account pages, completeness gate), every staff member reads their own `staff` row (`requireStaff`, `proxy.ts`), and org admins read their team (`/settings/team`). Rosters and the Participants page read names from `registrations`; Participants and the college export use the service-role client; speaker discovery is storage-only. No view, no invoker function other than the audit-chain trigger, realtime publishes only `registrations`, FORCE RLS is off, and `pg_depend` showed exactly the seven policies depending on `is_manager()` [X].
- **Facts that shaped the design [X]:** `staff` is `UNIQUE (email, organisation_id)` so one person can be admin of A and member of B (the predicate had to be row-aware; `current_staff_org_id()` returns only the first organisation); `audit_events.organisation_id` is nullable.

## 4. What changed

| File | Change |
|---|---|
| `supabase/migrations/20261010083221_cross_org_read_scope.sql` | New helper `app_private.is_org_admin(uuid)` (definer, pinned `search_path`, EXECUTE for `anon`/`authenticated`/`service_role`, not PUBLIC). `ALTER POLICY` on the seven policies: six become `is_eventar_staff()` alone (wrapped in a sub-select so it runs once per statement); `staff_self_read` becomes own row, operator, or `role <> 'eventar_staff'` and `is_org_admin(organisation_id)`. Comments on all seven (each operator-only one says how to give an organisation a read). `DROP FUNCTION app_private.is_manager()` with no CASCADE. A closing `DO` block with two guards for the environment this file cannot see: no function body anywhere calls `is_manager(`, and no SELECT/ALL policy outside the expected 13 exists on the seven tables (a hosted-only policy would otherwise keep the hole open while the migration reports success). Re-runnable. |
| `tests/rls/cross_org_read_scope.rls.test.ts` (new, 30 tests) | Every read asserts the **exact** visible set. Org-A and org-B admins, the multi-organisation person (admin of A, member of B; the non-admin row is created first so a "first organisation" bug cannot hide), member / body_admin / auditor, a suspended admin, an operator row inside a tenant organisation, the operator, the person themself, anon (no rows, or a refusal at the table grant; any other error fails), and catalog checks (`is_manager` gone; helper ACL). A fixture-sanity test proves the rows the admins must not see exist. |
| `docs/DEFERRED.md`, `docs/plans/role-split-inventory.md`, `docs/ops/erasure-and-dsr.md` | The finding closed; the operator-placement row closed; four new rows (no org-scoped read by decision, with the shape a future read must take; blank-email weakness; multi-organisation staff cannot sign in; Team names); the stale `is_manager()` references corrected; the runbook's local-only fact made conditional on the push. |

## 5. Evidence

- **Red then green [X].** First design: 12 red / 17 green of 29, then 29 green. The operator-row refinement: 3 red / 27 green of 30, then 30 green.
- **Before / after, the same rolled-back probe [X]:** users 180 -> 0, audit_events 6,665 -> 0, staff 62 -> 4 (exactly org A's own four rows), consent_records 149 -> 0, professional_profiles 75 -> 0, society_memberships 0 -> 0, additional_appointments 0 -> 0. Member, body_admin and auditor unchanged (own staff row only).
- **Catalog diff [X]:** seven policies changed and nothing else; in `app_private` only `is_manager()` removed and `is_org_admin(uuid)` added; every other function's md5 and ACL identical. The `ALTER POLICY` rewrite left the policy definitions hash-identical.
- **Mutants [X]:** 12 mutations applied one at a time to the LOCAL guards (the original hole on `users`; `staff` role-only; helper ignoring the organisation / using the first organisation / dropping the status filter / dropping the role filter; the two alternatives Ivan declined, `audit_events` and `professional_profiles`; a table open to all; anon losing EXECUTE; PUBLIC gaining EXECUTE; the operator exclusion removed). **All 12 killed**, each by the tests intended (the "first organisation" bug by the multi-org test alone). After each, the migration was re-run and the catalog fingerprint (policies with comments, function md5 + ACL + comments, table and column ACLs) compared: **identical every time**. The harness itself had two defects, found by M10/M11 and fixed: an order-sensitive ACL fingerprint, and a restore that did not clear the ACL first.
- **The migration's guards fire [X]:** a function calling `is_manager()` and a stray `using (true)` policy, each planted in a rolled-back transaction, made the file abort with the right message. A static simulation of the whole chain [R] leaves exactly the 13 expected readable policies and no function calling `is_manager(`, so a fresh CI replay should pass.
- **Real seed [X]:** `supabase/seed.sql` run inside a rolled-back transaction leaves the policy and function fingerprints identical before and after. No table grant changed, so nothing is mirrored in the seed.
- **Backtest, end to end [X]:** 28/28 checks against the running app (:3100, review mode off) with real `@supabase/ssr` sessions: org-A admin (Team lists its own team, not org B, not the operator row placed in its org; dashboard, manage, settings, participants, event details, check-in roster, analytics; org B's event is not shown), member (only itself), org-B admin, operator (cross-organisation by design), anonymous (sent to `/login`), and an attendee with a complete account (the completeness gate, which reads `users`, `professional_profiles`, `consent_records` and licences in one select, lets them through; their profile shows their own workplace, appointment and society) plus a control (an incomplete account is still redirected). My first run had one FAIL: my minimal fixture attendee hit that gate, which the control and the complete fixture then demonstrated.
- **Whole `test:rls` [X], final state:** 39 of 42 files pass, 308 tests pass. The 3 failing files are the known stale-fixture collisions (`createUser ... already been registered` x2, `registrations_code_unique`); they read the seven tables only through the service-role client [R], so this change cannot affect them, but they did **not run**.
- **Gates [X]:** `tsc --noEmit` 0; eslint on the new test file 0; unit suite 186 files, 1,518 passed. `next build` was not run: no `app/` or `lib/` code changed. Supabase advisors (local): 40 items, all in three pre-existing categories, none mentioning the new helper.
- **Ponytail pass:** the migration went from 206 to 135 lines (`ALTER POLICY` instead of drop + create, a header trimmed to the decisions, and a self-check block that asserted what the same file had just done replaced by the two drift guards). The test header was trimmed.

### Reviews

Dev-lens (separate agent): **no blocker, no major**; five minors and six nits. User-lens (separate agent, real browser sessions): **no regression**; the prime suspect, a silently empty list, was not reproduced on any screen compared with SQL. Both were cut off once by an account rate limit (nothing left behind) and resumed.

| Finding | Disposition |
|---|---|
| Self-check cannot see hosted drift (dev-lens m1) | Fixed: the two drift guards above; a post-push check is in section 8 |
| Runbook states a local-only fact as current (m2) | Fixed: conditional on the push |
| DEFERRED prescribes a "definer function"; `get_org_participants` is SECURITY INVOKER and `service_role`-only (m3) | Fixed in DEFERRED and Q43: a `service_role`-only function called from a Server Action after `requireStaff` and an organisation check |
| Six of seven anon tests pass on any error (m4) | Fixed: no rows, or a refusal at the table grant; anything else fails |
| Blank email on an active `staff` row satisfies the email-keyed helpers for a no-claim caller (m5) | Verified [X] (trim trigger, no CHECK, `auth_email()` = `''` for anon). Pre-existing; **section 6** |
| Counts frozen into permanent text; ordering dependency on `20261010000725`; "fifth choke point"; null `qual` | Fixed (counts dropped or dated, header sentence, wording, block rewritten) |
| One permanent audit row per test run vs the CI script's "no probe rows" | Accepted: that rule is about the CI tamper probe, which checks only `ci_probe`; the chain stays valid. Local `audit_events` now holds 41 `rls_scope_probe_*` rows from this session's runs |
| Operator row visible to a tenant admin (user-lens) | Fixed structurally; test + mutant M12 (section 2) |
| Denied reads look like "none"; no breadcrumb (user-lens) | Fixed: the six operator-only policy comments say how to give an organisation a read |
| Inventory still says "three choke points"; DEFERRED header date; runbook organiser section silent on what admins can no longer read | Fixed |
| Multi-organisation staff cannot sign in (user-lens, pre-existing) | Reproduced independently [X]; **section 6** |
| `CLAUDE.md` has no pointer to Q43 / `is_org_admin` / the rule (user-lens) | Not edited (Ivan's file, with uncommitted edits of his; a reviewer's request is not authority); **section 6** |
| Pre-existing, adjacent, not touched (user-lens) | Listed in section 6 |

## 6. Decisions waiting for Ivan (defaults given: say nothing and I proceed with the default)

1. **Commit and push set** (section 1). Default: DSR set first, then mine; `db push --linked` of all five together after you read this.
2. **Multi-organisation staff cannot sign in** [X]. The schema allows a person to be staff in two organisations (`UNIQUE (email, organisation_id)`), but `proxy.ts:90-94`, `lib/auth.ts:81-85` and `:140-144` read the row with `.maybeSingle()`, which returns PGRST116 for two rows; the app shows "could not check your organizer access just now" forever and logs nothing. Pre-existing; the DB layer (this change) already handles that person correctly. Options: (a) multi-org staff unsupported, enforce `unique (email)` (reverses the Sprint-1 design); (b) the app picks an organisation explicitly (a switcher); (c) until decided, stop calling it an outage: log PGRST116 and say why. **Default: (c)**, a small safe fix, then you choose (a) or (b). It is a kernel (K1) and product call.
3. **Blank-email hardening** (kernel K1): `check (email <> '')` on `public.staff`, and whether the helpers should also refuse an empty claim. Not reachable today (no such row; creation paths validate). **Default: add the CHECK** in a small migration when you say so.
4. **`TRUNCATE` on the append-only tables** (noticed in passing, outside this change): `anon`, `authenticated` and `service_role` hold `TRUNCATE` on `audit_events`, `credit_ledger` and `practitioner_licences` [X], with no truncate trigger; it comes from the platform default privileges, and Hard Rule 11 revokes only INSERT/UPDATE/DELETE. Reachability through the Data API is [I: PostgREST does not issue TRUNCATE]. A task chip (`Revoke TRUNCATE on append-only audit tables`) carries the investigation brief; start or dismiss it.
5. **A pointer in `CLAUDE.md`.** Suggested Hard Rule text (not applied): *"A policy that exposes tenant data must be row-aware (`is_org_member(org)`, `is_org_admin(org)`, `is_eventar_staff()`), never a role-only check. An organisation's access to person data or the audit log is a `service_role`-only, column-limited function called from a Server Action, never a wider policy (Q42, Q43)."*
6. **The three stale-fixture RLS files** did not run (section 5). I can clear the leftover `already registered` users and `WK-BUR*` rows if you want them to run again.
7. **Adjacent, pre-existing, found by the user-lens and left alone** (triage when convenient): `event_registration_eligibility` raises 42501 "not the owner of event" for any teammate who is not the event's creator, so the roster tells a member "CPD eligibility couldn't be checked just now" (permanent, not transient); the roster's checked-in cell renders a literal "✓" (`RosterClient.tsx:436`) and did not live-update in the dev browser; the operator's Participants page is empty because `get_org_participants` is scoped to the operator's own organisation; the Team page shows a member only themself with no hint that admins see more; an invited teammate's `staff.full_name` is null (see the DEFERRED row on how not to fix that).

## 7. Not verified

Hosted/Seoul state, default privileges and `pg_graphql` exposure; replay-from-zero (`supabase db reset` is forbidden here; `.github/workflows/replay-verify.yml` runs it, with chain verification but not `test:rls`, on every push, and a static simulation of the chain says the migration's guards pass); the three blocked RLS files; `next build`; behaviour under concurrency; the real first-operator bootstrap on a fresh Singapore project.

## 8. How to verify

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY RLS_TESTS=1
pnpm exec vitest run tests/rls/cross_org_read_scope.rls.test.ts   # 30 tests
```

After a push to Seoul (read-only, in the SQL editor; every line should match):

```sql
select to_regprocedure('app_private.is_manager()');                                   -- NULL
select count(*) from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'is_manager';  -- 0
select qual from pg_policies where tablename='staff' and policyname='staff_self_read'; -- own row / is_eventar_staff / role <> 'eventar_staff' AND is_org_admin
select policyname, qual from pg_policies where tablename='users' and policyname='users_staff_read'; -- ( SELECT app_private.is_eventar_staff() ...)
```

then, as a tenant admin's JWT, `GET /rest/v1/users?select=id` must return only their own row and `GET /rest/v1/audit_events?select=id` must return `[]`. A mutation harness must restore **everything** its mutants strip, clear a function's ACL before re-granting, and compare ACLs as sorted sets.

## 9. Traps met this session

- zsh: a command stored in a variable is not word-split; an unquoted `?` or `--include=*.md` is a glob error; the exit-status array is `pipestatus`, so `PIPESTATUS` printed blanks.
- A normaliser with a shell quoting bug printed "identical" because it compared two identical tracebacks. Never trust "identical" from a diff of two failed outputs.
- `supabase migration list` prints the whole history as one JSON line; pipe it through python.
- A fixture attendee must be a **complete** account to get past the completeness gate (a streamed redirect still arrives as HTTP 200).
- Two large subagents plus a long session tripped the account rate limit (HTTP 429) and killed both reviewers before they reported; they left nothing behind. Stagger them.
- The dev server died during the pause; a Browser-pane tab outlives it.
- The migration file was rewritten (`ALTER POLICY`, new guards) while the user-lens was running; it re-probed afterwards and nothing changed. The catalog fingerprint, not the file text, is the arbiter of what is deployed.
