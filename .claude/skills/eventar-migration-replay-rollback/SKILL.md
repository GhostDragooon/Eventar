---
name: eventar-migration-replay-rollback
description: Use when writing or applying an Eventar migration file.
category: verification
---

# Replay a migration inside begin and rollback before applying it

- Before `psql -f` or `supabase migration up --local`, replay the file in a rolled-back transaction with `ON_ERROR_STOP`. Pipe it through `(echo "begin;"; cat FILE; echo "rollback;") | /opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q`.
- With `-q`, silence means success. Any error prints and stops the replay. Only then apply the file.
- Never run `supabase db reset` or `db push` to test a migration. The replay is the test.
- Put the grant restatement and the `has_function_privilege` assertions in the file itself, so the replay proves the privileges too.
- Before changing a column or table that functions may read, list every function whose definition mentions it, with its SECURITY DEFINER flag and EXECUTE grantees, against the local DB (`/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`): `select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef definer, (select string_agg(r.rolname, ',') from pg_roles r where has_function_privilege(r.oid, p.oid, 'EXECUTE') and r.rolname in ('anon','authenticated','service_role')) as execs from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app_private') and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* '<column>' order by 1;`. Review each hit in the same migration before the change lands. A `set_*` or `create_*` definer with no grantees is a hit to read, not a hit to ignore.
- A rollback note in the file header must name the single function definitions to restore. Do not tell a future reader to re-run old migration files, because they hold other statements.
- Name the restore target by grepping, not by memory: `grep -ln "create or replace function <name>" supabase/migrations/*.sql | tail -1` gives the file that last defined it. Cite that file in the header. A migration timestamp recalled from an earlier session is a guess until grepped.
