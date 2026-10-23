# REVIEW CX-01 + DB-01 + CX-03: backtest lens

Reviewer: backtest lens (Claude, Sonnet 5.5). Tree: uncommitted on HEAD e1bd06f. Run 2026-10-22 20:32Z to 20:45Z (2026-10-23 HKT).
Evidence tags: [X] executed by me against the LOCAL stack (API 127.0.0.1:54321, Postgres 127.0.0.1:54322), [R] read, [I] inferred.
Stack safety: env came from `supabase status -o env` (API_URL printed as `http://127.0.0.1:54321` before every run [X]); `.env.local`, the Supabase MCP tools, `supabase db reset|push`, `next build` and any dev server were not used; `tests/cpd` files outside `test:rls` were not run. The `test:rls` lock (`scratch-demo/locks/test-rls.lock`) was held for steps 2 to 6 and for each later probe, and is released: only `dev-3100.lock` ("claude review-wave2 2026-10-22T20:21:17Z", the user-lens reviewer) remains [X].
Repo writes: this file only. Scratch files (SQL, a runner script, one vitest probe) live in the session scratchpad, outside the repo.
The agent-listing tool was not available in this subagent, so peer activity was checked through `pg_stat_activity`, `ps`, the lock directory and row-level deltas instead [X].

## Verdict

0 BLOCKER, 0 MAJOR, 6 MINOR, 4 NIT. All three cards' claims hold under execution. `pnpm test:rls`: 43 files, 362 tests, all passed, exit 0 (matches DB-01's hand-back exactly). The three formerly failing files pass twice back to back. The new seed re-assert yields exactly the expected posture on all 30 table/role cells, and no public table is unexplained in either direction. The CI assertion is empty on the local DB and names the offender for each of four injected grants.

The most important finding is MINOR-1: CX-01 made the helper heal stale *auth users*, but a stale *staff* row (the second crash residue the hand-back itself describes) still makes `mark_attended` fail in `beforeAll` with a message that does not say what to delete. Reproduced by execution, then cleaned.

## Step table

| # | Command (abridged) | Expected | Observed |
|---|---|---|---|
| 1 | psql counts at 20:32:47Z | residue counts recorded; chain clean | auth.users `@rls-test.invalid` 191 (of 228); staff rls-test emails 41; events matching `%RLS%`/`%fixture%`/`% DELETE ME` 41 (of 71); registrations `WK-%` 386 (of 410), of which 200 are `WK-BUR*`; `verify_audit_chain()` bad rows 0 [X] |
| 2a | `vitest run tests/audit/licence_mutations.test.ts` x2 | pass, pass | 23/23 (7 s), 23/23 (5 s), exit 0 both [X] |
| 2b | `vitest run tests/rls/mark_attended.rls.test.ts` x2 | pass, pass | 13/13 (4 s), 13/13 (6 s), exit 0 both [X] |
| 2c | `vitest run tests/rls/checkin_throughput.rls.test.ts` x2 | pass, pass | 1/1 (4 s), 1/1 (4 s), exit 0 both; no `deleteTestUser` console.error in any of the six logs [X] |
| 3a | `vitest run tests/rls/seed_grant_posture.rls.test.ts` | pass | 1/1, exit 0 [X] |
| 3b | psql `begin; \i supabase/seed.sql; ... rollback;` then `has_table_privilege` for the 10 tables x 3 roles x 4 privileges | equals `EXPECTED` | 30/30 cells equal `EXPECTED` (listed below). Control `anon SELECT events` = true after the seed. After the rollback the live DB reads `anon SELECT credit_disputes` = f, `authenticated INSERT professions` = f [X] |
| 3c | same tx: every public table where anon lacks SELECT or authenticated lacks any DML | each one in `EXPECTED`, in `audited_table_writes`, or revoked by a migration | 26 of 35 public tables listed, 0 unexplained (classification below) [X] |
| 3d | converse: 146 (table, role, priv) revokes extracted from `supabase/migrations/*.sql` (single-table form, table-level), checked for being held after the seed | none held except where a later migration re-grants | 12 held, all explained: SELECT on the five lookup tables for anon and authenticated (re-granted by 20260916000000) and `service_role` DELETE on `participation_evidence` and `practitioner_licences` (documented retained grant). Limit: my regex skips multi-table and `all tables` revokes [X] |
| 4a | the HELD query from `replay-and-verify.sh` via `docker exec supabase_db_Eventar psql -U postgres -d postgres -tA -c` | empty | empty, length 0 [X] |
| 4b | inside `begin/rollback`: `grant truncate on public.events to anon` | names `anon TRUNCATE events` | `anon TRUNCATE events` [X] |
| 4c | other injected grants, each rolled back | each named | `service_role TRUNCATE credit_ledger, authenticated TRIGGER audit_events` (two at once); `grant all on events to anon` -> `anon TRUNCATE events, anon TRIGGER events`; a temporary view with `grant trigger ... to anon` -> `anon TRIGGER _bt_view`; empty again after each rollback; view gone afterwards [X] |
| 4d | the script's own lines 47-54 extracted verbatim and run under `set -euo pipefail` (not the script, no reset) | quoting and exit status sound | `HELD=[]`, exit 0 [X] |
| 5 | `pnpm test:rls` once, 20:35:22Z to 20:35:43Z | all pass | Test Files 43 passed (43); Tests 362 passed (362); vitest duration 17.13 s; exit 0. No failure, so no rerun and no peer-contention analysis was needed [X] |
| 6 | step 1 counts again, plus per-file residue | no growth from the three files | see Residue below. Net growth is entirely from two other files in the `test:rls` script [X] |
| 7 | `vitest run lib/utils.test.ts` | pass | 7/7, exit 0 [X] |

Step 3b matrix after the real seed (role: privileges held), all equal to `EXPECTED` [X]:

- `invite_tokens`: anon S, authenticated S, service_role DISU.
- `credit_disputes`: anon none, authenticated S+I, service_role DISU.
- `professions`, `positions`, `degrees`, `specialties`, `societies`: anon S, authenticated S, service_role DISU.
- `professional_profiles`: anon none, authenticated S+I+U, service_role DISU.
- `additional_appointments`, `society_memberships`: anon none, authenticated DISU, service_role DISU.

Step 3c classification of the 26 listed tables (10 + 6 + 10) [X for the list, R for the reasons]:

- In the posture matrix (10): `additional_appointments`, `credit_disputes`, `degrees`, `invite_tokens`, `positions`, `professional_profiles`, `professions`, `societies`, `society_memberships`, `specialties`.
- In `audited_table_writes.rls.test.ts` (6): `audit_events`, `credit_ledger`, `data_subject_requests` (column-limited self-service INSERT, so the table-level check reads false), `organisation_body_authorisations`, `participation_evidence`, `practitioner_licences`.
- Neither, but narrowed by a named migration that the seed also repeats (10): `email_log` and `rate_limits` (20260803090000), `event_accreditation_groups`, `event_accreditation_occurrences`, `event_accreditations`, `registration_roles` (20260815020000), `event_occurrences` and `registration_checkins` (20260815000000), `events` INSERT/UPDATE (20260802182411, 20260804030000, 20260725144446), `staff` UPDATE (20260716150855).
- Unexplained: none.

## Residue

Taken at 20:32:47Z (before) and after the full suite (the end-of-session recount matches, so my probes added nothing net).

| Measure | Before | After | Delta |
|---|---|---|---|
| auth.users `@rls-test.invalid` | 191 | 200 | +9 |
| auth.users total | 228 | 237 | +9 |
| staff rls-test emails | 41 | 43 | +2 |
| events matching the fixture patterns | 41 | 43 | +2 |
| events total | 71 | 73 | +2 |
| registrations `WK-%` | 386 | 397 | +11 |
| registrations total | 410 | 421 | +11 |
| `verify_audit_chain()` bad rows | 0 | 0 | 0 |
| `verify_ledger_chain()` bad rows | not taken | 0 | n/a |

Every added row is attributable by diff [X]: users `elig-licensed`, `elig-owner`, `f1f5-happy`, `f1f5-sinkf1`, `f1f5-sinkf2`, `f1f5-sinkf3`, `f1f5-sinkf3spec`, `f1f5-sinkf5`, `f1f5-walkin`; staff `elig-owner`, `f1f5-owner`; events "Eligibility Fixture 1792701330907" and "F1-F5 Fixture 1792701327598"; one extra registration on each of eleven `WK-EC0/EL0/EN0/EU0/F17/F27/F37/F3S/F57/HP7/WI7` prefixes. These come from `tests/cpd/roster_eligibility.rls.test.ts` and `tests/cpd/award_f1_f5_gate.rls.test.ts`, both inside the `test:rls` script and both writing permanent ledger rows. No row outside those two files grew, so the user-lens reviewer's activity on :3100 added nothing to these tables in the window.

The three target files [X]:

- `markattended-*`, `lm-*`: 0 auth users and 0 staff rows left. No new `checkin-throughput-staff-*` row, no new `WK-<run>` registration, `WK-BUR` unchanged at 200.
- Still present, all from before this work: 3 orphan staff rows `checkin-throughput-staff-1789752226871|1789753065977|1789786041090` (created 2026-09-18 and 09-19; no matching auth user), event "burst-throughput RLS fixture — DELETE ME" with its 200 `WK-BUR*` registrations (CX-01 disclosed this), and event "self-check-in RLS fixture — DELETE ME" from `self_check_in.rls.test.ts`.
- `deleteTestUser` printed no error in any run [X].

## Findings

### MINOR-1 (CX-01): a stale staff row still breaks a rerun, and nothing says so

- Scenario: a crashed run leaves a `staff` row with a static email. Reproduced [X]: I inserted a staff row for `markattended-owner@rls-test.invalid` (copied from an existing orphan, new id), ran `tests/rls/mark_attended.rls.test.ts`. Result: `Test Files 1 failed`, `Error: staff fixture: duplicate key value violates unique constraint "staff_email_org_key"`, 13 tests skipped. I deleted that one row by id and reran: 13/13 pass. Net rows afterwards equal the start.
- Why it matters: CX-01's "idempotent" is true for `auth.users` leftovers (the helper now finds and removes them) and false for staff and event leftovers, which is the other half of the 2026-09-19 incident the hand-back describes. The hand-back lists this under "Open questions", so it is disclosed, not hidden. The gate is trustworthy for the failure CX-01 fixed, not for crash residue in general.
- Fix: a follow-up card where each of the three suites (and ideally `createTestUser` callers that insert staff) deletes `staff` rows by their static email in `beforeAll`, and fails with the table name if it cannot. Test-only.

### MINOR-2 (CX-01): the new failure message does not say what blocks the delete

- Scenario: reproduced the original `lm-user-b` case with the real helper [X]: created `bt-probe-user`, inserted a `practitioner_licences` row for it, called `createTestUser('bt-probe-user')` again. It threw `deleting leftover bt-probe-user@rls-test.invalid (<uuid>): Database error deleting user` (fail-visible, as intended). The text names the user and id but not the blocking table, so the next person still has to find the licences by hand, as CX-01's author did. `deleteTestUser` on the same blocked user did not throw and logged `deleteTestUser <email> (<uuid>): Database error deleting user` to stderr, also as intended. After the probe I removed the licence and the user; 0 rows left [X].
- Fix: append a hint to the `:67` message ("a non-cascading FK row such as practitioner_licences may block this delete"), or look up referencing rows before throwing.
- Note: the dev review proposed the same hint; this confirms the premise by execution.

### MINOR-3 (outside the three cards): `test:rls` leaves a fixed amount of residue every run

- Scenario: each full run adds 9 auth users, 2 staff rows, 2 events and 11 registrations (table above), from the two `tests/cpd` files that write permanent ledger rows [X]. The baseline already held 41 fixture events and 191 rls-test users. Nothing here is new or caused by the cards, and CX-01's "Fixtures created: none left by this card" is true [X].
- Why it matters: `auth.users` is already 237 and `listUsers()`'s first page is 50 [X: GoTrue admin list returned 50 users of 237], which is exactly the root cause CX-01 removed from the helper; any other code that scans `listUsers()` for a fixture will silently miss it. Residue also grows the work of every later run.
- Fix: none for these cards. If wanted, a periodic local clean-up recipe for `@rls-test.invalid` rows that skips the permanent-ledger fixtures.

### MINOR-4 (outside DB-01, pre-existing): eleven public tables give `anon` DML at the grant layer, with RLS as the only control

- Scenario [X, live DB, matches the post-seed state]: `anon` holds INSERT/UPDATE/DELETE on `accrediting_bodies`, `agenda_blocks`, `consent_records`, `organisations`, `organisers`, `registrations`, `speaker_checkins`, `survey_responses`, `users`; INSERT/DELETE on `staff`; DELETE on `events`. No migration or seed line narrows them. I ran `delete from public.<t>` as `anon` in a rolled-back transaction for each: 0 rows affected on all eleven (RLS blocks), rows intact afterwards (users 237, registrations 421, staff 68, events 73). Three of the tables are empty (`organisers`, `speaker_checkins`, `survey_responses`), so their 0 proves nothing [X].
- Why it matters here: DB-01's seed comment says the grant layer is the one hosted relies on; for these tables there is no grant layer, only RLS (Hard Rule 5 calls the anon policies "defense in depth"). Hosted most likely has the same grants through Supabase default privileges [I]. Not seed drift and not caused by DB-01; the posture test's matrix cannot see it.
- Fix: Ivan's call, in a separate SQL card if wanted: decide per table whether anon needs any write, then revoke and extend the matrix. The dev review noted the `staff` case only.

### MINOR-5 (CX-03): registering sizes makes them evict an earlier `leading-*`

- Evidence [X, the real `cn()` from `lib/utils.ts` run through node]: `cn('leading-tight','text-body-md')` returns `text-body-md`; the reverse order returns both; `cn('text-sm','text-label-md')` returns `text-label-md`; `cn('text-label-md','text-sm')` returns `text-sm`; `cn('text-label-md md:text-body-md')` keeps both. This is tailwind-merge's built-in "font-size removes earlier leading" rule, now applied to the project tokens, and it matches `text-sm` today.
- Exposure [R]: the nine source lines that hold both `leading-*` and a type token are static `className` strings that never pass through `cn()`; `components/ui` has no `leading-` class. So no live site changes. Multi-line `cn(` blocks and `className` props merged inside primitives are not covered by this scan.
- Fix: none needed. One assertion in `lib/utils.test.ts` would make the behaviour deliberate. The CX-03 hand-back should mention it.

### MINOR-6 (CX-01, process): CX-01's one-time clean-up and the loud-failure change are not covered by any rerun-after-crash test

- The hand-back's claim "baseline HEAD (listUsers) failed with 'already registered'" rests on the old helper, which I cannot run without editing the tree. I confirmed its premise: the admin `listUsers()` default page returns 50 users while `auth.users` has 237 [X], so a leftover past page 1 is invisible to the old code. The new helper's direct lookup was exercised against a real blocked and a real unblocked leftover (MINOR-2: the unblocked one was replaced with a new id and the blocked one threw) [X].
- Gap: no test pins the helper's two new branches, so a later edit could revert them silently. Fix: none required; if desired, a small test using a throwaway user, as in my probe.

### NIT-1: the dev review is stale against the current tree on three points

The files changed after the dev review was written. In the tree I tested [R and X]: the CI query uses `relkind in ('r','p','f','v','m')` and prints `role priv table` offenders (dev NIT-1 is fixed; view case executed and caught [X]); the user lookup is `lower(email) = lower($1)` (dev NIT-5 fixed); `deleteTestUser` now logs the error (dev MINOR-4 partly fixed: it logs, it does not throw, and logging was confirmed [X]). The dev review's own gate numbers and its other findings are unaffected by my runs.

### NIT-2: the CI step was run as an extracted fragment, not as the script

The script calls `supabase db reset`, so I ran its lines 47 to 54 verbatim under `set -euo pipefail` plus the same query by hand [X]. That proves the quoting, the empty-string branch and the detection. It does not prove the step inside a real replay [I]. DB-01 stated the same limit.

### NIT-3: orphan residue from earlier runs is still there

The three orphan `checkin-throughput-staff-*` rows and the two "DELETE ME" events above are harmless now (unique codes, static emails not reused) but will confuse the next person counting fixtures. Optional one-off clean-up, Ivan's call; I did not touch them.

### NIT-4: type-scale names used in code that have no token

`text-title-md` (9 uses), `text-title-sm` (8), `text-label-lg` (3) and the matching `font-title-*` / `font-label-lg` classes appear in `app/` and `components/` but `app/globals.css` defines no `--text-title-md`, `--text-title-sm` or `--text-label-lg` [X: grep of every `*.css`]. They produce no CSS today. Pre-existing and outside CX-03, but it is why `TYPE_SCALE` can be "complete against globals.css" while the code uses three more names; `cn('text-title-md','text-white')` returns `text-white` [X], the old behaviour, unchanged by the fix. UX cards may want to define or replace them.

## Claims of the hand-backs, checked

| Claim | Result |
|---|---|
| CX-01: three files pass, no residue | Pass x2 each, no residue from them [X] |
| CX-01: `test:rls` 42 files / 361 tests; DB-01: 43 / 362 | Now 43 / 362 [X] |
| CX-01: `checkin_throughput` afterAll cleans the run's rows | No new `WK-<run>` registrations, no new burst event or staff row after three runs [X] |
| DB-01: local posture now matches hosted for the ten tables | Matrix 30/30 equal to `EXPECTED`, which comes from the migrations [X, R]; hosted itself not reachable |
| DB-01: CI query 0 locally, 1 with a TRUNCATE grant | Confirmed, plus three more injected cases [X] |
| DB-01: no other table drifted | Both directions swept; nothing unexplained (MINOR-4 is pre-existing and different) [X] |
| CX-03: `lib/utils.test.ts` passes, signature unchanged | 7/7 [X]; 10 tokens equal the ten `--text-*` base tokens in `globals.css` [X, R] |
| CX-03: colour and size both kept | `text-body-md text-white` both orders, `text-label-md uppercase tracking-wide` all kept [X] |

## Not checked

- Hosted posture and a from-zero `supabase db reset` replay (forbidden). The live DB had already received the DB-01 block, so my seed replay shows the seed's effect on that state; because the seed's blanket grant resets DML and its revokes then narrow it, the DML result does not depend on earlier ACLs [I]. TRUNCATE/TRIGGER come from migration 20261010175112 [R].
- The hand-back mutation runs (seed lines dropped, `cmp`-restored): they need tree edits, which this review may not make [I].
- The visual and user-journey side of the CX-03 size changes (user lens, other reviewer).
- The 20 CX-03 rendered-class sites; I did not rerun the static scan.
- Multi-table and `all tables` revoke forms in my converse sweep (3d).
