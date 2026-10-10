-- Take TRUNCATE and TRIGGER away from the API roles (anon, authenticated, service_role).
--
-- HARDENING. No reachable path to either privilege was found (see Reach). It matters because the guarantees
-- this project makes ("application roles cannot modify audit rows", an append-only ledger) held for INSERT,
-- UPDATE and DELETE only: Hard Rule 11 revokes those three and nothing else.
--
-- Source: the platform's default privileges give the API roles TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on
-- every table created in public, on top of DML. Before this migration, on the local stack, anon held TRUNCATE
-- on 23 of the 35 tables, authenticated on 26 and service_role on all 35, and TRIGGER on 24, 27 and 35.
-- credit_disputes is the only table where TRUNCATE was ever revoked by name (20260804040000); the others that
-- lacked it (11 for anon, 8 for authenticated) lost it as a side effect of older `revoke all` statements.
--
-- TRUNCATE ignores RLS, row-level triggers and the DELETE revoke. Measured 2026-10-11, local stack, in
-- transactions that were rolled back:
--   * TRUNCATE audit_events succeeded as anon, authenticated and service_role (no FK points at it).
--   * As service_role, TRUNCATE credit_ledger CASCADE, TRUNCATE practitioner_licences CASCADE and
--     TRUNCATE users CASCADE (14 more tables: the ledger, licences, evidence, DSR requests) succeeded.
--   * anon/authenticated were stopped on the ledger and licence cascades only because credit_disputes, which
--     references the ledger, had lost TRUNCATE: a cascade needs the privilege on every table it reaches.
-- TRIGGER lets a role attach a trigger to a table. All three roles could attach a BEFORE INSERT trigger to
-- audit_events, credit_ledger and practitioner_licences. One named to sort ahead of the chain trigger ran as
-- audit_writer inside write_audit_event() and rewrote an event before it was hashed; verify_audit_chain() then
-- reported 0 of 7,677 rows invalid. One that returns NULL made write_audit_event() drop an event silently,
-- with the same clean result. So either privilege defeats the tamper evidence (an emptied chain verifies clean
-- too: 0 rows, 0 flagged).
--
-- Reach: both need SQL running as an API role. PostgREST exposes only GET/POST/PATCH/DELETE; no function in
-- public uses dynamic SQL or mentions TRUNCATE; pg_graphql has no such mutation; no event trigger can see a
-- TRUNCATE. So this closes the grant against paths that may appear later (a function with invoker rights, a
-- direct SQL connection as an API role, a console). It does not cover SECURITY DEFINER functions owned by
-- postgres, or anything on the postgres connection: they run as the owner, who keeps both privileges (as the
-- owner must), and are a code-review matter.
--
-- Nothing needs them: no migration, seed, test, script or application code issues TRUNCATE or creates a
-- trigger as an API role. Local tests and scripts that must empty a table connect as postgres (sqlSuperuser
-- in tests/helpers/clients.ts).
--
-- REFERENCES and MAINTAIN stay. REFERENCES needs CREATE on a schema to be abused, and the API roles have
-- CREATE on none. MAINTAIN (PostgreSQL 17+ only, so naming it would break an older project) allows VACUUM and
-- LOCK TABLE: an availability matter, and it too needs SQL as the role.
--
-- Blanket on purpose, not a list of audited tables: a per-table list is the shape that failed four times (see
-- Hard Rule 11). Statement 1 clears every table that exists. Statements 2 and 3 stop new tables starting with
-- the privileges; a later `grant all` hands them back, so grant named privileges (select, insert, update,
-- delete). Three older migrations use `grant all ... to service_role` (professional_profiles, the controlled
-- lists, the profile enrichment tables); they run before this one, so this covers them.
--
-- Operations. REVOKE takes no lock on the tables themselves (catalog locks only), so it is safe on a live
-- database. `supabase db push` runs this file in one transaction: if the self-check raises, nothing is
-- applied. Seoul has not been inspected from here; PROJECT_STATE.md (2026-09-04) records authenticated holding
-- TRUNCATE and TRIGGER on professional_profiles there. Idempotent.
--
-- Rollback (restores the wider grants):
--   grant truncate, trigger on all tables in schema public to anon, authenticated, service_role;
--   alter default privileges for role postgres in schema public
--     grant truncate, trigger on tables to anon, authenticated, service_role;
-- To narrow this to a list: replace statement 1 with `revoke truncate, trigger on table <names> ...`, and
-- narrow the self-check below and the sweep in tests/rls/audited_table_writes.rls.test.ts to the same tables.

-- 1. Every table that exists.
revoke truncate, trigger on all tables in schema public from public, anon, authenticated, service_role;

-- 2. Tables postgres creates in public from now on.
alter default privileges for role postgres in schema public
  revoke truncate, trigger on tables from anon, authenticated, service_role;

-- 3. The schema-less default row, which is added to the per-schema row for every new table. None exists on the
--    local stack, so this is a no-op there (it creates no row); it makes a project that has one safe.
alter default privileges for role postgres
  revoke truncate, trigger on tables from anon, authenticated, service_role;

-- Self-check, read from the catalog rather than trusted from the statements above. supabase/seed.sql runs
-- AFTER every migration locally; it grants only select/insert/update/delete, so it cannot undo this, and
-- tests/rls/audited_table_writes.rls.test.ts asserts the end state either way.
do $$
declare
  v_held text;
begin
  select string_agg(
           format('%s -> %s (%s)', c.relname,
                  case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
                  a.privilege_type),
           ', ' order by c.relname, a.privilege_type)
    into v_held
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'f')
     and a.privilege_type in ('TRUNCATE', 'TRIGGER')
     and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'));
  if v_held is not null then
    raise exception 'TRUNCATE/TRIGGER still granted on: %', v_held
      using hint = 'This file rolls back. Look for a table not owned by postgres, or an ACL entry granted by another role (psql: \dp public.<table>).';
  end if;

  if exists (
    select 1
      from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole
       and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
       and d.defaclobjtype = 'r'
       and a.privilege_type in ('TRUNCATE', 'TRIGGER')
       and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
  ) then
    raise exception 'default privileges still grant TRUNCATE/TRIGGER on new tables in public'
      using hint = 'Look at pg_default_acl for role postgres: a row for public, or one for all schemas.';
  end if;
end $$;
