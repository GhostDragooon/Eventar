---
name: eventar-migration-replay-rollback
description: Use when writing or applying an Eventar migration file.
category: verification
---

# Replay a migration inside begin and rollback before applying it

- Before `psql -f` or `supabase migration up --local`, replay the file in a rolled-back transaction with `ON_ERROR_STOP`. Pipe it through `(echo "begin;"; cat FILE; echo "rollback;") | /opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q`.
- With `-q`, silence means success. Any error prints and stops the replay. Only then apply the file.
- Never run `supabase db reset` or `db push` to test a migration. The replay is the test.
- Hosted push (`supabase db push --linked`, Seoul = production) needs Ivan's explicit go for that specific push. "Push and migrate where possible" is not a go for Seoul. Once he says so, dry-run first and show the pending list before the real push.
- A hosted push applies every pending file in version order. Ivan's go for one new migration is a go for the whole pending list, so show that full list and ask again. Never push one file out of order with `--include-all`.
- Never pipe the dry-run through `tail`: `tail -15` hid 18 of 19 pending files. Count them with `supabase db push --linked --dry-run 2>&1 | grep '•' | wc -l` and list them with `grep '•'`.
- Once the dry-run shows exactly the files Ivan approved, apply with `supabase db push --linked <<< "y" > <scratch>/push.out 2>&1`; the here-string answers the Y/n prompt. Read the output with password and `postgres://` lines filtered out, then verify the applied state read-only before calling it done.
- If the hosted dry-run fails at connect (`failed SASL auth ... i/o timeout` against the `aws-1-ap-northeast-2.pooler.supabase.com:5432` pooler), it is a network fault, not a credential one. Report it and retry later. Never read `.env.local` or touch `SUPABASE_DB_PASSWORD` to diagnose it.
- Put the grant restatement and the `has_function_privilege` assertions in the file itself, so the replay proves the privileges too.
- Before changing a column or table that functions may read, list every function whose definition mentions it, with its SECURITY DEFINER flag and EXECUTE grantees, against the local DB (`/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`): `select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef definer, (select string_agg(r.rolname, ',') from pg_roles r where has_function_privilege(r.oid, p.oid, 'EXECUTE') and r.rolname in ('anon','authenticated','service_role')) as execs from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app_private') and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* '<column>' order by 1;`. Review each hit in the same migration before the change lands. A `set_*` or `create_*` definer with no grantees is a hit to read, not a hit to ignore.
- A rollback note in the file header must name the single function definitions to restore. Do not tell a future reader to re-run old migration files, because they hold other statements.
- Name the restore target by grepping, not by memory: `grep -ln "create or replace function <name>" supabase/migrations/*.sql | tail -1` gives the file that last defined it. Cite that file in the header. A migration timestamp recalled from an earlier session is a guess until grepped.
- Volatility is a correctness setting, not a tuning knob. A function that reads the clock, a window, or rows written earlier in the same statement must be `volatile`. Marking it `stable` made a window trigger return stale results (M1, 2026-11-14), and the planner may cache its answer. Write the failing case first, confirm it fails on the current DB, then change the flag and read `provolatile` back.
- An unpushed migration may be edited in place. Then the local DB needs only the changed function: extract it with `awk '/^create or replace function/,/^\$\$;/' FILE > <scratch>/fn.sql`, apply with `psql ... -v ON_ERROR_STOP=1 -1 -f <scratch>/fn.sql`, and read back `provolatile`, `prosecdef`, `proconfig` plus `has_function_privilege('authenticated', '<signature>', 'EXECUTE')`. Hosted push still needs Ivan's go.
- Seed and fixture SQL (the RLS test inserts) gets the same replay before the test runs. PostgreSQL rejects a data-modifying CTE nested inside a subquery, so write each insert as its own top-level statement, then replay it in the rolled-back transaction.
