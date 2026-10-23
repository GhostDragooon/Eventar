-- SEC-01 (MVP plan, Ivan's rulings 2026-10-23): two grant-layer narrowings.
--
-- 1. `anon` loses INSERT, UPDATE and DELETE on every table and view in public, and on new ones.
--    The platform's default privileges hand anon DML on every table; earlier migrations narrowed it table by
--    table and eleven were never touched: accrediting_bodies, agenda_blocks, consent_records, events (DELETE),
--    organisations, organisers, registrations, speaker_checkins, staff (INSERT, DELETE), survey_responses, users.
--    RLS denied the writes, so none was reachable, but the anon key ships in every browser and a grant that
--    relies on a policy staying correct is the shape that failed four times (Hard Rule 11). Measured 2026-10-23,
--    local stack: 11 of 35 tables.
--    Nothing needs it. Every public write in the app is a Server Action with the service-role client or a
--    SECURITY DEFINER function; the only writes through the cookie client (supabaseServer) sit behind a session
--    gate (requireStaff or requirePractitionerSelf), so a signed-out request never reaches one. supabaseAnonServer
--    signs people in and reads.
--    registrations keeps its anon INSERT policy (registrations_anon_insert_when_event_published) as defence in
--    depth; with the grant gone it is unreachable by anon. authenticated is untouched.
--
-- 2. `invite_tokens` becomes definer-only for service_role too: INSERT and UPDATE are revoked. It is an audited
--    table (accept_invite_token writes invite_accepted), so Hard Rule 11 says no API role writes it directly.
--    create_invite_token and accept_invite_token are SECURITY DEFINER owned by postgres and are unaffected.
--    service_role keeps DELETE for cleanup and erasure, like practitioner_licences and participation_evidence.
--    Nothing in the app writes it with service_role (app/settings/team/actions.ts only selects).
--
-- Operations. REVOKE takes no lock on the tables themselves (catalog locks only). `supabase db push` runs this
-- file in one transaction: if the self-check raises, nothing is applied. Idempotent. Table-level REVOKE also
-- removes any column-level grant on the same table.
--
-- Rollback (restores exactly what the migration removed; the other 24 tables had anon DML revoked on purpose by
-- earlier migrations, and a blanket `grant ... on all tables` would reopen the append-only ones):
--   grant insert, update, delete on public.accrediting_bodies, public.agenda_blocks, public.consent_records,
--     public.organisations, public.organisers, public.registrations, public.speaker_checkins,
--     public.survey_responses, public.users to anon;
--   grant delete on public.events to anon;
--   grant insert, delete on public.staff to anon;
--   alter default privileges for role postgres in schema public grant insert, update, delete on tables to anon;
--   grant insert, update on public.invite_tokens to service_role;
-- Not covered by the default-privilege rows above: tables created by supabase_admin keep their own defaults
-- (a migration runs as postgres and cannot change those); the sweep in tests/rls/audited_table_writes.rls.test.ts
-- is the backstop.

-- 1a. Every table and view that exists.
revoke insert, update, delete on all tables in schema public from public, anon;

-- 1b. Tables postgres creates in public from now on.
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;

-- 1c. The schema-less default row, which is added to the per-schema row for every new table. None exists on the
--     local stack, so this is a no-op there; it makes a project that has one safe.
alter default privileges for role postgres
  revoke insert, update, delete on tables from anon;

-- 2. invite_tokens: definer-only writes for service_role as well; DELETE stays.
revoke insert, update on public.invite_tokens from service_role;

-- Self-check: raise (and roll the push back) if anything is still held.
do $$
declare
  v_anon text;
begin
  select string_agg(c.relname || ' (' || p.priv || ')', ', ' order by c.relname, p.priv)
    into v_anon
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
   where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'v', 'm')
     and case when p.priv = 'DELETE'
              then has_table_privilege('anon', c.oid, p.priv)
              else has_any_column_privilege('anon', c.oid, p.priv) end;
  if v_anon is not null then
    raise exception 'SEC-01: anon still holds DML: % | REVOKE only removes grants made by the running role: check pg_class.relowner and aclexplode(relacl).grantor for these tables (expect postgres)', v_anon;
  end if;

  if has_table_privilege('service_role', 'public.invite_tokens', 'INSERT')
     or has_table_privilege('service_role', 'public.invite_tokens', 'UPDATE') then
    raise exception 'SEC-01: service_role still holds INSERT or UPDATE on public.invite_tokens';
  end if;
  if not has_table_privilege('service_role', 'public.invite_tokens', 'DELETE') then
    raise exception 'SEC-01: service_role lost DELETE on public.invite_tokens (it must keep it)';
  end if;
end $$;
