---
name: eventar-grant-guard-proof
description: Use when changing grants, revokes, or privilege checks.
category: security
---

# A grant guard counts only after it names an offender you injected

Before trusting any assertion over table privileges, grant the forbidden privilege on purpose inside a rolled-back transaction and confirm the guard names that table and role. A guard that stays silent on an injected offender is blind.

- Inject with `begin; grant truncate on public.registrations to anon; <guard query>; rollback;` against the local stack via `/opt/homebrew/opt/libpq/bin/psql` on 127.0.0.1:54322. Expected output lists `anon TRUNCATE registrations`.
- Read privileges with `has_table_privilege(role, oid, priv)`, never from the migration text. A REVOKE on a named role is a no-op while `public` or the default ACL still grants it (Hard Rule 11).
- `service_role` has BYPASSRLS, so only a table-level REVOKE stops its writes. A column-level REVOKE needs a table-level REVOKE first.
- Seed files that re-grant DML must stay DML-only. Widening to ALL hands TRUNCATE and TRIGGER back to the API roles.
- Denied-write tests assert SQLSTATE `42501` AND the message. The grant and a trigger both raise 42501, so match the grant text (`permission denied for function f`) or the trigger's own RAISE text to prove the layer you meant.
- An UPDATE that matches zero rows under RLS returns no error. Assert the row count (`rows: 1`). A grant-back probe must also set the JWT claims the SELECT policy needs, or the row is invisible and the count is 0.
- When a migration revokes a table grant, tests that proved a trigger by writing as that role now stop at the grant. Re-prove the trigger in a rolled-back grant-back helper (`updateAsRoleWithGrant` in `tests/helpers/insertAsRole.ts`), and update the grant posture matrix in the same change; the seed posture test fails otherwise.
- Run the grant and RLS suites sequentially with other local-stack gates.
- Revoke every DML verb the policy does not admit, not only the one under test. With UPDATE gone and no DELETE policy, a signed-in DELETE still answers HTTP 200 with `[]`, not 42501, so silence hides the grant. Check `has_table_privilege(role, table, 'DELETE')` in the same probe. Also probe `'MAINTAIN'` (PostgreSQL 17+): the DML list omits it, and `anon` held MAINTAIN on 24 of 35 public tables when DB-05 was checked, so a revoke sweep must include it.
- Seed files run blanket grants that hand UPDATE and DELETE back. Put the revoke after the blanket grant in `supabase/seed.sql`, then prove what the seed leaves: `(echo "begin;"; cat supabase/seed.sql; echo "select has_any_column_privilege('authenticated','public.registrations','UPDATE')"; echo "rollback;") | /opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -At`.
- A revoke on an audited table must be re-asserted in three places in the same commit: `supabase/seed.sql`, the CI replay gate, and the audited-writes matrix `tests/rls/audited_table_writes.rls.test.ts`. Missing one lets the next seed or replay quietly re-open the grant.
- A mutant that fails zero named tests means its branch has no test. Write the test, watch the mutant fail it, then restore and check the fingerprint. An unrelated test does not count as killing it.
- Boundary tests on a SQL function count only after a mutant fails them. Snapshot `md5(pg_get_functiondef(...))`, apply a copy with one constant changed (60 to 90, `>` to `>=`), and assert the snapshot moved. A mutant that does not move is VACUOUS. Require the named test to fail, then restore and assert the snapshot is back at baseline.
- Mutant runs: use `templates/mutant-harness.sh`. It applies each mutant, records the exact failing test names, re-applies the migration, and checks a fingerprint (function def, policies, table ACL, function ACL) against baseline. A moved fingerprint means stop. Grant mutants: write the SQL to `$OUT/NAME.sql` and call `run NAME`.
- `CREATE OR REPLACE FUNCTION` keeps the existing ACL. Restate the `revoke` and `grant` lines in the migration anyway, and assert `has_function_privilege` for each role inside it.
- A new SECURITY DEFINER function grants EXECUTE to PUBLIC by default. Revoke it with `revoke execute on function ... from public, anon`, then assert `has_function_privilege('anon', '<signature>', 'EXECUTE')` is false. A table grant never covers a function's EXECUTE.
- A BEFORE UPDATE trigger that protects an enumerated column list drifts when a column is granted later. Add a test that reads the live `authenticated` UPDATE column privileges and asserts each granted column is protected by the trigger or on a named exemption list with its reason. Test each writer class (`authenticated`, the definer owner, `service_role`) separately.
- Defence layers hide each other. Before a mutant run, drop the masking layer too, and confirm the named test fails on the layer you meant to prove.

Checklist and query recipe: `references/grant-matrix.md`. Mutant harness: `templates/mutant-harness.sh`.
