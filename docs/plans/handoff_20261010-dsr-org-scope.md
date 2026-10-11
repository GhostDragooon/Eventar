# Session handoff, 2026-10-10: erasure is platform-only, DSR handling is organisation-scoped, the DSR table is read-only for app roles

> **Superseded as the entry point (2026-10-11).** Open items, current state and the build plan are in [handoff_20261011-consolidated.md](handoff_20261011-consolidated.md). This file stays the evidence record; its state lines are stale: committed 2026-10-11 as `44c86de` (+ docs `66c243d`; not pushed to Seoul).

Written after the phase-completion protocol (two dev-lens and two user-lens reviews, a backtest). Evidence tags: **[X]** executed, **[R]** read in code or the catalog, **[I]** inferred, not reproduced. Decision record: vault Decisions Log **Q42**.

## 1. State: LOCAL ONLY, NOTHING COMMITTED OR PUSHED

- Migration `20261010000725_dsr_authority_scoped_to_subject_org.sql` is applied to the **local** stack only. The hosted Seoul project **presumably still has the original hole** [I: its MCP credentials are stale, so this was not checked]. Seoul receives migrations only through Ivan's own `supabase db push --linked`.
- The push set is now **four local-only migrations**: `20261002000000` and `20261002010000` (the P2a session's), `20261009011823` (the cross-org peer's `get_org_participants` fix, committed locally) and this one. A single `db push --linked` pushes every pending one, so decide the set together.
- Commit plan if asked (stage explicit paths only, never `git add -A`; another session has `docs/plans/2026-10-02-g1-ground-tokens.md` staged): the migration, `supabase/seed.sql`, `tests/rls/dsr_org_scope.rls.test.ts`, `tests/rls/dsr_audited.rls.test.ts`, `tests/rls/audited_table_writes.rls.test.ts`, `docs/ops/erasure-and-dsr.md`, `docs/DEFERRED.md`, `docs/plans/role-split-inventory.md`, `CONTEXT.md`, this file. Everything else in the tree belongs to other sessions.
- `PROJECT_STATE.md` was **not** edited (it carries another session's uncommitted entry). Suggested pointer: *"2026-10-10 DSR/erasure authority: erasure platform-only, DSR handling org-scoped, DSR table read-only for app roles. Migration `20261010000725` (local only). See handoff_20261010-dsr-org-scope.md and vault Q42."*

## 2. What was decided (Ivan, 2026-10-10, two rounds)

1. Round 1, option (c) of the brief: **org-scope the target** (an organiser admin may act on a person with a registration at their organisation's events).
2. Round 2, after the reviews showed the link can be manufactured and that erasure lands on a shared identity row: **erasure is platform-only** (`eventar_staff`), and **close the DSR table's direct writes now** (Hard Rule 11). DSR processing and reading stay organisation-scoped.
3. Applied by me as a consequence of the two decisions together (Ivan may veto): only platform staff can **complete or reject an erasure request**; an organiser admin can set it `in_progress` or hand it on as `escalated`. Otherwise the compliance record could say "erased" when nothing was.

## 3. The finding, and what the investigation added

The brief: `pseudonymise_user` and `transition_dsr` (SECURITY DEFINER, executable by `authenticated`) were gated by role only. Reproduced today [X] as an org-A `organiser_admin` JWT with no tie to the victims: an unrelated attendee was renamed `ERASED-…`; another subject's erasure request moved `pending → rejected`. Both wrote an audit event naming the org-A admin. What the brief did not have:

- **The same writes were reachable without the functions [X].** `dsr_staff_all` (ALL, `is_manager() OR is_eventar_staff()`) plus table-level UPDATE/DELETE for `authenticated`: PATCH and DELETE of another subject's request both succeeded with **no audit event**. A function-only revoke (the brief's option (a)) would have closed nothing here. A direct UPDATE on `public.users` matched 0 rows, so for erasure the function really is the only path.
- **`service_role` could call neither function [X].** `pseudonymise_user` had no `service_role` EXECUTE; `transition_dsr` gates on the JWT email, which a service key lacks. So "service_role keeps it" was false.
- **Provenance [R]:** the Sprint-1 design (`docs/architecture/BASELINE-DELTAS.md`) was platform-only; the shipped gate was `('manager','eventar_staff')`, the single-organisation admin; the 2026-07-09 role remap turned `manager` into `organiser_admin` one-to-one.
- **The link that grants authority can be manufactured [X, ran it end to end]:** anyone, staff included, can register a person's email as a guest at a published event (`source` still reads `self_registration`); when that person presses "Claim past events" the row is linked to their account. That is why erasure went platform-only.
- **"Erasure" is shallow [R from the body, X from the user-lens]:** only `users.full_name` plus two flags. The person can still sign in; email, names, phone, profile, licences, registrations and the ledger remain; the person can clear the flags themselves. Nothing reads the flags. This is pre-existing and **not fixed**; it is now documented in the function comment, `docs/ops/erasure-and-dsr.md`, `CONTEXT.md` and `docs/DEFERRED.md`.

## 4. What changed

| File | Change |
|---|---|
| `supabase/migrations/20261010000725_dsr_authority_scoped_to_subject_org.sql` | New helper `app_private.staff_for_subject(uuid)` (returns the authorising staff row: `eventar_staff` for anyone, or an `organiser_admin` of an organisation with an account-linked registration; status, role and relation checked on the SAME row; deterministic tie-break). `pseudonymise_user`: inline active-`eventar_staff` gate, before the subject is looked up. `transition_dsr`: gated by the helper, bound to the subject (`update … and subject_user_id = v_subject`), erasure terminal-state guard. Policy `dsr_staff_all` (ALL) replaced by `dsr_staff_read` (SELECT, keyed on the helper). `INSERT/UPDATE/DELETE` revoked from `public/anon/authenticated`; `authenticated` keeps `INSERT (subject_user_id, request_type, request_notes)`. Comments on both functions (one-line summary plus detail, neutral on purpose: PostgREST shows them to every signed-in user) and on the table (tells whoever sees PostgREST's "GRANT INSERT …" hint not to follow it). A catalog-assertion block that fails the migration if any of that is not true. Re-runnable. |
| `supabase/seed.sql` | **Added the table to the Hard Rule 11 re-assertion list.** The seed blanket-grants DML to every table after the migrations on every `supabase db reset`, so without this the next local reset, the CI replay and a fresh-project provision would silently reopen the table [X: the dev-lens ran the real seed in a rolled-back transaction before and after]. |
| `tests/rls/dsr_org_scope.rls.test.ts` (new, 24 tests) | Erasure refusals and the operator path; `transition_dsr` scoping (unrelated, other organisation, member, suspended, member-in-A/admin-in-B, guest-only, multi-organisation attribution, platform unscoped, the erasure terminal-state guard and its escalated hand-off); direct table access (visibility, PATCH, DELETE, re-point, filing). Every denial asserts `42501` and reads state back through `service_role`. |
| `tests/rls/audited_table_writes.rls.test.ts` | New `data_subject_requests` block (4 tests): anon denied, column-limited self-service INSERT with every operator-only column (`id`, `submitted_at`, `status`, `resolver_staff_id`, `resolved_at`, `due_at`, `resolution_notes`) denied, no own UPDATE/DELETE, `service_role` DML retained. INSERT assertions also require "permission denied" in the message, because with RLS on, a policy denial is also `42501`. |
| `tests/rls/dsr_audited.rls.test.ts` | Fixtures give `nonStaff` a linked registration at the admin's organisation so the organiser-admin cases keep their intent; the not-found case calls as `eventar_staff`; stale `require_active_staff` comments corrected. |
| `docs/ops/erasure-and-dsr.md` (new), `CONTEXT.md` (4 terms), `docs/DEFERRED.md` (5 rows), `docs/plans/role-split-inventory.md` | Interim runbook, glossary, deferrals with re-entry criteria, and the inventory rows this change made false (plus the new fourth choke point). |
| vault `02 — Decisions Log.md` | **Q42.** |

## 5. Evidence

- **Red then green.** First design: 11 failing, 4 passing, then all green. Final design: 7 red / 30 pass, then 64 green across the five relevant files; the erasure guard: 1 red / 39 pass, then green [X].
- **Mutants [X]:** 22 mutations applied one at a time to the live LOCAL guards (helper: relation, role, platform shortcut, attribution, guest-by-email, staff status, role-and-relation-on-different-rows; erasure: role, status; `transition_dsr`: the erasure guard dropped, widened to non-erasure, widened to `escalated`, widened to the operator; policy: role-only again, open to everyone; grants: UPDATE, DELETE, `status` insert, resolver insert, anon insert, `service_role` DML stripped). **21 caught, each by at least one named test. One survivor, expected and documented:** the `transition_dsr` subject-bound `UPDATE` (the race it hardens needs two concurrent sessions). The harness restores by re-applying the migration and compared md5 + ACL + policies + table and column ACLs with the baseline after every mutant (final: identical). Its first version left the DB damaged when the `service_role` mutant defeated the restore; the migration's own assertion caught it, and the harness now re-grants first.
- **Backtest of the original attack on the final state [X]** (rolled-back probes, same org-A admin and victims): erasure and `transition_dsr` refused `42501` with the new copy; PATCH and DELETE `permission denied for table`; self-filed pre-closed request `42501`; the plant-and-claim chain now fails at erasure; victims and requests untouched; zero audit events; audit chain valid before and after; no leftovers.
- **Catalog [X]:** ACLs and SECURITY DEFINER flags of both functions unchanged; helper executable by `authenticated` only; policies `dsr_self_create`, `dsr_self_read`, `dsr_staff_read`; `authenticated` has no table-level INSERT/UPDATE/DELETE, column INSERT on exactly three columns, no column UPDATE; `anon` none; `service_role` full. OpenAPI: PostgREST shows the one-line summary and a description for both functions and the table.
- **Whole `tests/rls` + `tests/audit` [X], final state:** 33 files pass, 243 tests pass, 0 fail outside the three known-unrelated files (section 8).
- **Gates [X]:** `tsc --noEmit` 0; eslint on the three test files 0; unit suite 186 files, 1,518 passed, 0 failed. `next build` was not run: no `app/` or `lib/` code changed.
- **Reviews.** Dev-lens round 1: ship after fixes, no blocker. User-lens round 1: ship after fixes (F1 to F15). After Ivan's decisions: dev-lens delta, ship after fixes (the seed; the erasure-request guard); user-lens delta, **ship**. Dispositions:

| Finding | Disposition |
|---|---|
| Relation manufacturable; effect per person (dev R1, user F4/F6) | Erasure made platform-only (Ivan). DSR processing still keyed on the link: **open, section 6a** |
| Erasure shallow (user F1) | Pre-existing. Documented everywhere; DEFERRED row; not fixed |
| Table writes unaudited, forged pre-closed requests (user F2/F3) | Fixed: grants, column-limited INSERT, read-only policy, matrix row, seed |
| Seed re-opens the table on reset (dev delta M1) | Fixed in `supabase/seed.sql`, proven with the real seed |
| Org admin could close an erasure request (dev delta M2) | Guard added (section 2, item 3) |
| Suspended / mixed-role untested; race; tie-break; stale docs; nits (dev round 1) | Tests added; update bound to the subject (the race itself needs two sessions, so mutant T5 is an expected survivor); `, s.id`; docs and header fixed |
| Vague refusal copy; copy over-promises "erase"; no cause or next step (user F9, n3) | Rewritten to name the rule and the `escalated` hand-off |
| Comments invisible / visible to every signed-in user (user n4, dev delta m4) | Split summary and description; neutral; detail moved to the runbook |
| PostgREST hint recommends the GRANT that reopens the hole (user n2) | Table comment says not to |
| No docs, runbook, glossary (user F5/F8) | `docs/ops/erasure-and-dsr.md`, `CONTEXT.md` |
| Cross-tenant READ policies (user F7) | Not touched. DEFERRED row 1, before Stage 8; task chip raised |
| Lifecycle, audit payload, merged messages, `service_role` call path, emailed-request intake, two organisations share one request, notes unbounded (user F10 to F14, n6, dev delta m3) | Pre-existing or by design. DEFERRED row 3 |
| Silent `DELETE` no-op on `registrations`; invite hash echoed in an error (user n7, n9) | Pre-existing, outside this change. Noted in DEFERRED row 3 |

## 6. Decisions waiting for Ivan

**a. DSR-processing authority is still keyed on a link an organisation can plant.** [X, user-lens delta N1.] Plant a guest registration with a stranger's email, wait for their "Claim past events", and that organisation can then **read the stranger's free-text request notes and complete or reject their non-erasure requests**. Erasure is out of reach now, and the stakes are a request record with an audit event, but the read is real. Options: (1) provenance fix: stamp registration `source` server-side and count only registrations the person made themselves, and list events and organisers on the claim page; (2) make completing and rejecting platform-only for **every** request type (one more condition in the guard; also ends two linked organisations overwriting each other's notes) and keep organisation read access; (3) accept until the console is designed. My recommendation: (2) now, (1) when the claim flow is next redesigned.

**b. Commit and push set** (section 1).

**c. Veto check** on the erasure terminal-state guard (section 2, item 3).

## 7. Not verified

Hosted/Seoul (state, default privileges, pg_graphql: it is not enabled on the local stack, so hosted GraphQL exposure of this table is unchecked); the `transition_dsr` race (needs two sessions); a UI (none exists); concurrency, rate limits; whether Singapore provisioning will run `supabase/seed.sql` [I: the seed's own comments say fresh projects do].

## 8. How to verify (local stack only)

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY RLS_TESTS=1
pnpm exec vitest run tests/rls/dsr_org_scope.rls.test.ts tests/rls/dsr_audited.rls.test.ts tests/rls/foundations.rls.test.ts tests/rls/function_grants.rls.test.ts tests/rls/audited_table_writes.rls.test.ts
```

Three other RLS files fail for an unrelated reason (`createTestUser` reads one page of users; leftover `WK-BUR*` codes): `tests/audit/licence_mutations.test.ts`, `tests/rls/mark_attended.rls.test.ts`, `tests/rls/checkin_throughput.rls.test.ts`. Prove a guard is not vacuous by applying a mutant to the LOCAL database, running the test, and restoring; compare `md5(pg_get_functiondef(...))` and the ACL before and after. **A harness must restore everything its mutant strips** (this session's `service_role` DML mutant left the DB damaged until the harness learned to re-grant it).

## 9. Traps met this session

- `supabase/seed.sql` blanket-grants after the migrations: **any table-level grant or revoke in a migration must be mirrored there**, and verified by running the real seed inside a rolled-back transaction. Three review passes missed it; the delta reviewer caught it.
- PostgREST's permission-denied hint recommends the table-level `GRANT` that would undo a column limit.
- With RLS on, a policy denial of an INSERT is also SQLSTATE `42501`; assert the message too.
- zsh: `path` is tied to `$PATH`; an unquoted `$P` holding a command line is not word-split.
