# Session handoff, 2026-10-11: API roles no longer hold TRUNCATE or TRIGGER (LOCAL ONLY, NOTHING COMMITTED OR PUSHED)

Written after the phase-completion protocol: one dev-lens and one user-lens review (separate agents) on the TRUNCATE-only version, then a backtest on the final state. Evidence tags: **[X]** executed here (local stack only, in transactions that were rolled back unless stated), **[R]** read in code, the catalog or `--help`, **[V]** vendor docs, **[I]** inferred, not reproduced.

Origin: `handoff_20261010-cross-org-read-scope.md` §6 item 4 (the task chip "Revoke TRUNCATE on append-only audit tables"). This session is that chip; the item is answered here and there is nothing left to start or dismiss.

## 0. If you read one thing

- The finding is **valid but latent**. No path that issues TRUNCATE or CREATE TRIGGER as an API role was found [X]. It is **wider than the brief**: the platform default hands both privileges to `anon`, `authenticated` and `service_role` on all 35 `public` tables, and TRIGGER (found by the dev-lens reviewer, confirmed by me) can defeat the audit chain's tamper evidence.
- The fix is applied to the **local** database only. Nothing is committed or pushed. Seoul is untouched and unverified.
- **One hazard.** `tests/rls/audited_table_writes.rls.test.ts` and `supabase/seed.sql` also hold the DSR session's uncommitted hunks. A wholesale `git add` of either file either commits tests that need this migration without the migration, or sweeps the DSR hunks into my commit. See section 1.
- What needs you: D1 (scope) and D2 (Hard Rule 11 wording) in section 6, and the Seoul sequence in section 7.

## 1. State

| Path | State | Mine (line numbers as of HEAD `d6adae1`; they move if the DSR session edits) |
|---|---|---|
| `supabase/migrations/20261010175112_revoke_truncate_and_trigger_from_api_roles.sql` | new, untracked | all of it |
| `tests/rls/audited_table_writes.rls.test.ts` | modified, **mixed** | line 62 (the `sqlSuperuserQuery` import), lines 40-46 (header paragraph), lines 421-535 (the `TRUNCATE and TRIGGER` describe block; line 536 is the file's existing outer `});`). The DSR session's: lines 15-25 and 309-419 (`// ---- LIFECYCLE: data_subject_requests ----`). |
| `supabase/seed.sql` | modified, **mixed** | lines 18-20 (a three-line comment). The DSR session's: 33-35 and 42-49. |
| `docs/plans/handoff_20261011-truncate-trigger-revoke.md` | new (this note) | all of it |

Nothing else was edited: not `CLAUDE.md`, `PROJECT_STATE.md`, the vault, CI, helpers or application code.

- **Local DB.** The migration was applied with `supabase migration up --local`. I deleted and re-created its own row in `supabase_migrations.schema_migrations` once, because I edited the file after the first apply (only that version's row). Checked at the end [X]: 0 (table, role, privilege) pairs held by the three API roles on `public` tables, and no stray roles, tables, triggers, functions or default-ACL rows left by my probes. Sequences such as `audit_events.chain_seq` advanced during rolled-back probes; harmless, since that sequence already had gaps.
- **Git.** `main` is ahead of `origin/main` by 3 (the peer commits `ea5a6a7`, `c8a0d77`, `d6adae1`). Another session's `docs/plans/2026-10-02-g1-ground-tokens.md` is staged. Peers were idle for the whole session and no mutation ran while one was active.
- **Seoul push queue** [R from the two peer handoffs]: `20261002000000`, `20261002010000`, `20261009011823`, `20261010000725`, `20261010083221` and this one (`20261010175112`, which sorts last). Six local-only migrations; one `db push --linked` applies every pending one in timestamp order, so the set is decided together.
- **Commit hazard, in detail.** The DSR plan commits `supabase/seed.sql` and `tests/rls/audited_table_writes.rls.test.ts` by path. If they do, my hunks ride along and `HEAD` has 16 tests that fail on a fresh database (they need this migration). If I commit first by path, the DSR hunks ride along. Either way the commit must be built on a temporary index from `HEAD` plus only one side's hunks (procedure in the memory note `commit-around-peer-staged-files`; verify in a clean worktree afterwards). Mine-only is cheap because my hunks are independent of the DSR ones. Not done: you said not to commit unless asked.

## 2. The case

**Source [R].** The platform's default privileges give the API roles `arwdDxtm` on every table created in `public`. Hard Rule 11 revokes INSERT, UPDATE and DELETE only. `credit_disputes` is the one table where TRUNCATE was ever revoked by name (`20260804040000`); a few others lost it as a side effect of older `revoke all` statements.

**Extent [X].** Before: TRUNCATE held in 84 (table, role) pairs (anon 23, authenticated 26, service_role 35, over 35 tables) and TRIGGER in 86 (24, 27, 35). In 31 of the TRUNCATE pairs, on 12 tables, the role had been denied DELETE yet could still TRUNCATE. For anon and authenticated every pair bypasses RLS.

**TRUNCATE, executed [X].**
- `TRUNCATE audit_events` succeeded as anon, authenticated and service_role (no FK points at it). As anon and authenticated it ran although RLS showed them 0 rows.
- As service_role, `TRUNCATE credit_ledger CASCADE`, `practitioner_licences CASCADE` and `users CASCADE` succeeded; the last reaches 14 more tables (the ledger, licences, evidence, DSR requests; closure confirmed from the FK catalog).
- anon and authenticated were stopped on the ledger and licence cascades only by accident: `credit_disputes` had lost TRUNCATE and references the ledger, and a cascade needs the privilege on every table it reaches.

**TRIGGER, executed [X].**
- All 9 role x protected-table combinations (anon, authenticated, service_role x audit_events, credit_ledger, practitioner_licences) could attach a BEFORE INSERT trigger. No API role can CREATE in any non-temp schema, but all can create temp functions.
- A trigger created as `authenticated`, named to sort before `audit_events_hash_trigger`, rewrote an event before it was hashed. It ran as `audit_writer`. `verify_audit_chain()` then flagged **0 of 7,677 rows**.
- A trigger returning NULL made `write_audit_event()` return NULL and store nothing; the verifier was still clean. An emptied chain also verifies clean (0 rows, 0 flagged).
- This contradicts the "application roles cannot modify audit rows" claim in `20260704130400_init_audit_chain.sql`.

**Reachability: none found.** PostgREST 14.15 exposes only GET/POST/PATCH/DELETE [X]. No function in `public` uses dynamic SQL or mentions TRUNCATE [X]. No statement-level TRUNCATE triggers exist, and the 6 event triggers are `supabase_admin` housekeeping that cannot see TRUNCATE (tested: a `ddl_command_start` trigger intercepted CREATE TABLE and not TRUNCATE) [X]. pg_graphql generates only insert/update/delete mutations [V] and is not installed locally [X]. **Not covered:** the 54 `postgres`-owned SECURITY DEFINER functions, anything on the `postgres` connection, and the dashboard SQL editor. They run as the owner, who keeps both privileges; that is a code-review matter.

**Seoul [R/I].** `PROJECT_STATE.md:233` (a 2026-09-04 probe) records `authenticated` holding TRUNCATE and TRIGGER on `professional_profiles` there. The rest is inferred to match local.

**Tables Rule 11 or a migration protects, and who held TRUNCATE before [X].** Permanent append-only: `audit_events`, `credit_ledger` (all three roles). Lifecycle, definer-only: `practitioner_licences`, `participation_evidence` (all three). Self-service lifecycle: `data_subject_requests` (all three), `credit_disputes` (service_role only), `professional_profiles` (authenticated, service_role). Registry: `organisation_body_authorisations` (service_role only). Definer-only: `event_occurrences`, `registration_checkins`, `registration_roles`, `event_accreditation_groups`, `event_accreditations`, `event_accreditation_occurrences` (all three). The other 21 tables are covered by the sweep.

## 3. What changed

| File | Change |
|---|---|
| migration `20261010175112_...` | (1) `revoke truncate, trigger on all tables in schema public from public, anon, authenticated, service_role`; (2) the same revoke from the default privileges for `postgres` in `public`; (3) the same for the schema-less default row (a no-op locally, creates no row, protects a project that has one); then a catalog **self-check** that raises, naming each table, role and privilege, if anything remains. Comments carry the evidence, the rollback recipe and how to narrow it to a list. **Left on purpose:** REFERENCES (no API role has CREATE anywhere) and MAINTAIN (PG17+ only; naming it would break an older project). |
| `tests/rls/audited_table_writes.rls.test.ts` | 16 tests: one row per protected table (14), a sweep over every `public` table, and a default-privilege check. Catalog reads only (`has_table_privilege`, which follows PUBLIC and role inheritance). Every failure names `table -> role (privilege)` and the remedy. Runs under `pnpm test:rls` only. |
| `supabase/seed.sql` | A comment only: the blanket grant is DML-only on purpose; never widen it to `ALL`. No functional change was needed [X]. |

## 4. Evidence

- **Tests first.** RED (84 pairs reported for the TRUNCATE-only version, then 86 for the widened one), then GREEN 16/16 after applying the migration [X].
- **ACL diff.** An exploded snapshot of table, column and default ACLs differs before and after by exactly the API-role TRUNCATE and TRIGGER rows and nothing else [X]. The owner (`postgres`) keeps both; DML is untouched (service_role INSERT on `events` true, on `credit_ledger` false) [X].
- **Attacks replayed.** All 15 TRUNCATE attacks and all 9 CREATE TRIGGER attacks now fail with 42501 [X].
- **Seed.** The real `seed.sql` run on top of the migrated database, in a rolled-back transaction, leaves 0 pairs, with a control showing the seed really executed (an `anon` SELECT grant I removed first came back) [X].
- **New tables.** A table `postgres` creates in `public` now starts without TRUNCATE and TRIGGER and with DML [X]. A simulated schema-less default row: without statement 3 a new table starts with TRUNCATE for anon, the self-check raises, and statement 3 clears it [X].
- **Operations.** REVOKE takes no lock on the tables themselves (catalog locks only) [X]. Idempotent (re-applied; identical snapshot) [X].
- **Mutation harness: 13 mutants, all caught, all restored byte-identically** (ACL snapshot md5 `99973745c1f8bb59245bd4951ff8b5df` before and after; the test, migration and seed files unchanged) [X]. Mutants: a single (table, role) grant; a table the per-table list does not name (only the sweep fails); granted to PUBLIC; inherited through a new NOLOGIN role; the default ACL regranted per-schema and schema-less; TRIGGER variants; a new table plus `grant all`; `grant all` on an existing table; the whole migration reverted (all 16 fail). Each mutant had to change the snapshot, trip exactly the expected tests, show the expected message text, and restore. The harness found a real defect in my own test: vitest abbreviates long arrays in the one-line message, so the names now go in the message string.
- **Regression.** Full local `pnpm test:rls`: 324 passed, 37 skipped, 3 files failed (stale fixtures, section 8). `tsc --noEmit` exit 0. `eslint` on the changed test file clean. A plain `vitest run` (no `RLS_TESTS`) still skips the file [X]. No repo code or test issues TRUNCATE or creates triggers as an API role (grep) [X].
- **Memory.** I saved `grant-guard-mutation-harness-recipe` (the technique and gotchas) and appended one bullet to `eventar-local-stack-cli-2109-grants` (the seed-drift fact in section 9).

Re-run the guard locally (never touches `.env.local`; the helpers refuse a non-local URL):

```bash
_e="$(supabase status -o env)"; g(){ printf '%s\n' "$_e" | sed -n "s/^$1=\"\(.*\)\"\$/\1/p"; }
export NEXT_PUBLIC_SUPABASE_URL="$(g API_URL)" NEXT_PUBLIC_SUPABASE_ANON_KEY="$(g ANON_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(g SERVICE_ROLE_KEY)" RLS_TESTS=1
pnpm exec vitest run tests/rls/audited_table_writes.rls.test.ts -t TRUNCATE
```

The harness, the pre-flight file and the PoC scripts live in this session's scratch directory, which is not durable. Say so if you want any of them added to the repo.

## 5. Reviews and what happened to each finding

- **Dev lens.** MAJOR: TRIGGER comes from the same default and is worse (applied, then re-proved by execution). MINOR: a schema-less default row passed the self-check silently (statement 3 plus a wider check). MINOR: "safe on Seoul" was unverified (reworded; pre-flight in section 7). MINOR: the protected-table comment overclaimed; "only because credit_disputes" and "14 tables" were imprecise (all corrected). NIT: "every table" wording, foreign tables (added), a seed comment (added), mirrors in CLAUDE.md and the vault (D2).
- **User lens.** `grant all` hands both back, so my "cannot forget" claim was false (reworded). The narrowing recipe would have broken the self-check (corrected). Failure messages hid the cause for PUBLIC, inherited and unapplied-migration cases (remedy text on every failure; the harness asserts it). Operator gaps: rollback, a hint on the exception, lead with "hardening" (done). Scope over-claims (fixed). A dead end for a legitimate reset (pointer to `sqlSuperuser`). A mislabelled group in the protected list (fixed). Critique of my Rule 11 draft (adopted in section 10).
- **Not taken:** deleting the per-table rows (kept, as you asked), revoking MAINTAIN or REFERENCES, a CI change, any doc edit.
- **Not done:** a third independent review of the final wording. I audited every factual claim in my own comments instead and corrected two that were wrong.

## 6. Decisions waiting for Ivan (defaults given: say nothing and I proceed with the default)

1. **D1, scope.** Default: as built (every `public` table, TRUNCATE and TRIGGER). Alternative: the 14-table list; the migration comment says what to edit (statement 1, the self-check and the sweep).
2. **D2, wording.** Default: not applied. Draft in section 10 for the Hard Rule 11 text in `CLAUDE.md`, a suggested Q44, and a `PROJECT_STATE.md` pointer. The vault note `10 - Architecture/Security + Robustness.md` also lists only insert/update/delete. A grep of the vault found no decision that conflicts, and the Working Method note already lists "grant-level REVOKE" and "append-only trigger" as structural defences.
3. **D3, commit.** Default: wait for your go; mine-only blobs on a temporary index; the migration is a new file; order relative to the DSR commit does not matter as long as nobody adds the two shared files wholesale.
4. **D4, Seoul.** Your call and your command (`db push --linked`; peers report the MCP credentials are stale). Default: not pushed. Run the pre-flight first (section 7).
5. **D5, CI.** Default: no change. CI replay does not run `test:rls`, so a future `grant all` is caught only by a local run. An optional five-line assertion in `scripts/ci/replay-and-verify.sh` would close that.
6. **D6, seed drift (section 9).** Default: leave. Say if you want the seed's re-assert block extended and the remaining tables audited.
7. **D7, owner tier.** Default: nothing. A statement-level `BEFORE TRUNCATE` trigger would stop an accidental owner-level TRUNCATE (limits: the owner can drop it, and `session_replication_role = replica` bypasses it).
8. **D8, MAINTAIN and REFERENCES.** Default: leave (reasons in the migration comment).
9. **D9, the three stale-fixture RLS files.** Default: leave. I can clear the leftover `*@rls-test.invalid` users and `WK-BUR*` rows (inherited from the DSR handoff, section 6 item 6).
10. **D10, a third review pass** on the final wording before you push. Default: not run.
11. **D11, harness and pre-flight into the repo** (`scripts/` or `docs/ops/`). Default: not added.
12. **D12, replay from zero.** Not run for this migration (`supabase db reset` is forbidden on the shared stack). Default: rely on `.github/workflows/replay-verify.yml` on push, or run it yourself when the stack is free.

## 7. To execute, in order

1. **Read the diff.** The migration first, then the test block (`tests/rls/audited_table_writes.rls.test.ts:421`).
2. **Answer D1 and D2**, or say nothing for the defaults.
3. **Seoul, when you decide to push the six-migration set.**
   - Pre-flight, read-only. Paste into the Seoul SQL editor, or save as a file and run `supabase db query --linked -f <file>` [R: flags from `--help`, not run]. **All three must return zero rows.** If one does not, do not push; the push would roll back with a message naming the offender.
     ```sql
     -- 1. tables in public that postgres does not own
     select c.relname, pg_get_userbyid(c.relowner) as owner from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','f','v','m') and pg_get_userbyid(c.relowner) <> 'postgres';
     -- 2. TRUNCATE/TRIGGER entries granted by someone other than the owner
     select c.relname, a.grantor::regrole as grantor, a.grantee::regrole as grantee, a.privilege_type
       from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','f')
        and a.privilege_type in ('TRUNCATE','TRIGGER') and a.grantor <> c.relowner;
     -- 3. default-privilege rows that keep handing them to new tables (schema-less rows included)
     select d.defaclnamespace::regnamespace as in_schema, a.grantee::regrole as grantee, a.privilege_type
       from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r'
        and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
        and a.privilege_type in ('TRUNCATE','TRIGGER') and a.grantee::regrole::text in ('anon','authenticated','service_role');
     ```
     These ran clean (0 rows each) on the migrated local database, and returned rows on a simulated pre-migration state [X].
   - `supabase db push --linked`.
   - Post-push check, expect `0`:
     ```sql
     select count(*) as pairs_still_held
       from pg_class c cross join (values ('anon'),('authenticated'),('service_role')) r(role)
       cross join (values ('TRUNCATE'),('TRIGGER')) p(priv)
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','f') and has_table_privilege(r.role, c.oid, p.priv);
     ```
   - Rollback if ever needed is in the migration's header comment (two statements).
4. **Commit** when you say go (D3). Suggested message in section 10.
5. **After sign-off:** paste the Rule 11 text, add Q44, add the `PROJECT_STATE.md` pointer (I left both alone: `CLAUDE.md` and `PROJECT_STATE.md` carry other uncommitted edits), and close item 4 in `handoff_20261010-cross-org-read-scope.md` section 6.

## 8. Not verified

- **Seoul entirely**: relation owners, ACL grantors, default-privilege rows, pg_graphql exposure, server version.
- **Replay from zero** of this migration (D12).
- **Three RLS files did not run** because of stale local fixtures: `tests/audit/licence_mutations.test.ts` and `tests/rls/mark_attended.rls.test.ts` ("A user with this email address has already been registered"), `tests/rls/checkin_throughput.rls.test.ts` (`registrations_code_unique`). They fail in fixture setup, before any privilege-sensitive code, and the log has no truncate, trigger or permission-denied text [X]. Same three the DSR handoff reports.
- Behaviour under concurrency; Realtime, Storage and pg_net surfaces.
- The vault beyond a grep for TRUNCATE, default privileges and Rule 11 (Data Model and Security + Robustness were not read in full).
- A third independent review of the final text (D10).

## 9. Adjacent, found and left alone

- **Seed drift [X].** After the seed, `invite_tokens`, `credit_disputes` and `professions` hold INSERT/UPDATE/DELETE for anon and authenticated that their migrations revoked (`20260911000000`, `20260804040000`, `20260916000000`), because the seed's re-assert block does not list them. Local RLS runs see more than hosted on those tables. The other controlled lists were not checked. TRUNCATE and TRIGGER are unaffected (the seed grants DML only).
- **Platform-owned schemas [X].** 11 tables in `storage`, `net` and `supabase_functions` still grant TRUNCATE and TRIGGER to the API roles; they are owned by platform roles and not ours to change. It matters when the evidence locker (B6) lands on Storage.
- **Definer functions [X].** 54 SECURITY DEFINER functions in `public` are owned by `postgres` (one by `audit_writer`). They keep both privileges as the owner. Worth a standing review rule: a definer function must never run SQL or identifiers supplied by its caller.
- **Owner tier** (D7).

## 10. Text ready to paste

**Hard Rule 11, append after the two lifecycle bullets** (`CLAUDE.md`; not applied):

> **No API role holds `TRUNCATE` or `TRIGGER` on any `public` table.** The platform default-grants both to `anon`, `authenticated` and `service_role` on every new table. `TRUNCATE` ignores RLS, row-level triggers and the DELETE revoke; `TRIGGER` lets a role slip a trigger in ahead of the hash-chain trigger. Migration `20261010175112_revoke_truncate_and_trigger_from_api_roles` removed both and stops new tables starting with them; the 'TRUNCATE and TRIGGER' block of `tests/rls/audited_table_writes.rls.test.ts` sweeps every `public` table (`pnpm test:rls` only; no per-table row needed). Grant named privileges (`select, insert, update, delete`), never `grant all` or `alter default privileges ... grant all`. To empty a table in a local test, connect as postgres (`sqlSuperuser`).

**Decisions Log, suggested Q44** (vault; not written):

> ## Q44: API roles hold no TRUNCATE or TRIGGER on any public table (2026-10-11)
> **Date:** 2026-10-11. **Status: PROPOSED.** Migration `20261010175112` is applied to the LOCAL database only; it reaches Seoul only through Ivan's own `supabase db push --linked`.
> **Context:** The platform's default privileges give the API roles TRUNCATE and TRIGGER on every `public` table. Hard Rule 11 revoked INSERT/UPDATE/DELETE only. Executed locally: TRUNCATE emptied `audit_events` as every API role and wiped the ledger and licences as `service_role` through a cascade; a trigger attached by an ordinary role rewrote an audit event before it was hashed and `verify_audit_chain()` stayed clean. No reachable path was found.
> **Decision:** Revoke both from every `public` table and from the default privileges, with a catalog self-check and a standing sweep test. REFERENCES and MAINTAIN stay.
> **Consequences:** Nothing in the repo used either privilege. `grant all` re-opens it; the sweep catches that under `pnpm test:rls` only. SECURITY DEFINER functions owned by `postgres` and platform-owned schemas are out of scope.
> **Related:** Hard Rule 11 (repo `CLAUDE.md`) · Q42 · `20260804040000` (the one earlier TRUNCATE revoke).

**`PROJECT_STATE.md` pointer** (not written):

> 2026-10-11 API-role TRUNCATE/TRIGGER: the platform default handed both to anon/authenticated/service_role on every `public` table; TRIGGER can defeat the audit chain. Migration `20261010175112_revoke_truncate_and_trigger_from_api_roles` (LOCAL only until `db push --linked`) revokes both everywhere and from the default privileges; guard: the 'TRUNCATE and TRIGGER' block in `tests/rls/audited_table_writes.rls.test.ts`. Handoff: `handoff_20261011-truncate-trigger-revoke.md`.

**Commit message** (when you say go):

```
fix(db): API roles hold no TRUNCATE or TRIGGER on any public table

The platform default privileges give anon, authenticated and service_role TRUNCATE and
TRIGGER on every table in public. TRUNCATE ignores RLS, row-level triggers and the DELETE
revoke; TRIGGER lets a role attach a trigger ahead of the hash-chain trigger. Hard Rule 11
revoked only INSERT, UPDATE and DELETE. Revoke both from every table and from the default
privileges (per-schema and schema-less), with a catalog self-check, and add a sweep to the
audited-table write guard. No reachable path was found; this is hardening.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
