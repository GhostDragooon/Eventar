---
name: eventar-db-state-review
description: Use when auditing Eventar DB counts, fixtures, drift, Seoul, or replaying a migration.
category: verification
---

# Eventar DB review: read the local stack with psql, never Seoul

- Query only the local stack through `scripts/local-psql.sh -c "<sql>"`. It hardcodes 127.0.0.1:54322 and opens a read-only session, so a stray write fails.
- "Check Seoul" or "check the other DB" does not authorise the Supabase MCP. In Eventar that MCP reaches Seoul production (project `muieupgkpbxpqsrjjwol`). Say so and ask Ivan for a go before any call. Do not call it to find out. On 2026-11-03 the review tried `list_migrations` (auth failed) and `execute_sql` (rejected by a localSettings rule); both should not have been attempted. On 2026-11-05 the same review was told "check also seoul", called the MCP anyway (`list_projects`, `list_migrations`, `execute_sql`), and then asked Ivan to reset the Seoul DB password so the MCP could connect. Do not do either. A request to check Seoul is not a go for the MCP route: name the conflict with the project rule and ask which route Ivan wants. Never ask Ivan to reset or rotate a production credential to make a forbidden tool work.
- psql meta-commands (`\g`, `\set`) fail inside `-c` with a syntax error. Put multi-statement SQL in a `.sql` file wrapped in `begin;` and `rollback;`, and run it with `-f` once you have confirmed the local-psql wrapper forwards `-f`.
- A staff-gated RPC such as `event_registration_eligibility(event_id, p_actor_override)` raises `require_active_staff` when called bare from psql. It ran only after `set local role service_role`, with an `organiser_admin` row from the event's own organisation passed as the override. An `eventar_staff` row picked without an organisation match failed. Name the role and organisation in any finding built on such a call.
- Read the columns before any count. Use `information_schema.columns` for each table in the query. Known traps: `organisations` has `name`, not `display_name`; `events` has `start_time`/`end_time`; email lives on `auth.users`, not `public.users`.
- Row counts: `pg_class.reltuples` and `n_live_tup` are estimates, not counts. Report `select count(*)` per table. On 2026-11-16 the estimate showed `degrees` at 0 and `invite_tokens` at 1 where exact counts were 11 and 15.
- If the wrapper path in a brief does not exist, do not improvise a connection. Run psql with `PGOPTIONS='-c default_transaction_read_only=on'` against 127.0.0.1:54322 only, then confirm `show default_transaction_read_only` returns `on` before any query.
- Qualify every column in a join to `auth.users`. `created_at` is ambiguous across `users` and `auth.users`.
- Do not put a per-table loop with nested escaped quotes on one zsh line. It fails with `bad math expression`. Write the loop to a `.sh` file in the scratch dir and run it with `bash`.
- Count fixtures by prefix (`ZZ-`, and the `A2-`/`MB-` accrediting bodies). Unprefixed rows you cannot attribute are drift: report them by name and do not delete them. Cleanup rules: `eventar-fixture-leak-cleanup`.
- A cause you did not check is labelled unverified. The 2026-11-03 review guessed a test teardown for 240 `users` rows with no `auth.users` row and never checked it.
- Do not say a change is safe, or that the inventory is complete, until the six-place consumer map is written into the map doc. Name the places not yet checked. On 2026-11-05 the reply "nothing I've done can hurt the platform" came before any map existed, and Ivan had to ask "are you sure everything is mapped out?". Map first, then conclude.
- A duplicate-store claim needs a measured drift count, not a reading of the DDL. Example: `registrations.check_in_at` vs `registration_checkins` measured 0 drift.
- When a hosted or live-state fact changes (a migration applied, a count moved), grep the docs for the old wording before finishing, e.g. "Seoul untouched" or "local only", and fix every hit in the same change. On 2026-11-05 three files still said "Seoul untouched" after a peer session pushed 19 migrations.
- Present clean-up as tiers: no schema change; small migrations; squash. Name the block that owns each item and the decision Ivan must make. Do not run tiers 2 or 3 without his pick.
- Before calling a column or function retirable, map its consumers in six places, one query each: (a) `prosrc` regex over every non-system schema, for functions; (b) `pg_depend` for constraints; (c) policies, views, matviews, triggers with `WHEN` clauses, and column defaults; (d) implicit readers such as `to_jsonb(new)` in triggers, and keys written into `audit_events` payloads; (e) `app/`, `lib/`, `components/`, `scripts/` and `supabase/seed.sql`, where scripts that use the service role skip the authorisation check and the audit row; (f) tests, under both fixture shapes. Writes count too: check `information_schema.column_privileges` for `service_role` before calling a column unused.
- Put the decision list at the top of the map doc (§0), recommendation first, with the tier detail below it.
- Query set and last measured baseline: `references/db-review-queries.md`.

## Migrations: replay in a rolled-back transaction before applying
- Replay the file first: `(echo "begin;"; cat FILE; echo "rollback;") | psql <local url> -v ON_ERROR_STOP=1 -q`. Silence means success. Never `supabase db reset` or `db push` to test a migration.
- Put grant restatements and `has_function_privilege` assertions inside the file, so the replay proves the privileges too.
- Before you change a column or a function input, list every function that mentions it, with its SECURITY DEFINER flag and EXECUTE grantees. Review each hit in the same migration.
- Volatility is correctness. A function that reads the clock, a window, or rows written earlier in the same statement must be `volatile`. Write the failing case first, then change the flag and read `provolatile` back.
- An unpushed migration may be edited in place. Then apply only the changed function to the local DB, and read back `provolatile`, `prosecdef`, `proconfig` and the EXECUTE privilege.
- A hosted push needs Ivan's go, and a go for one file is a go for the whole pending list. Dry-run first, list every pending file, and never push one file out of order.
- Name a restore target by grep (`grep -ln "create or replace function <name>" supabase/migrations/*.sql | tail -1`), never from memory.
