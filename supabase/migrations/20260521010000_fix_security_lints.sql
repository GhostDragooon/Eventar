-- Pre-Phase-3 audit cleanup.
--
-- N1 (function_search_path_mutable): Postgres best practice — every function
-- should pin its search_path so a malicious caller can't hijack name resolution
-- by manipulating their own session search_path. Applies to the three INVOKER
-- helpers we own.
--
-- N2 (anon/authenticated SECURITY DEFINER function exposure): Supabase's
-- PostgREST exposes every function in `public` via /rest/v1/rpc/*. The three
-- auth helpers return null/empty/false for anon today (safe-by-accident), but
-- exposing them is information leakage and a future-change footgun. The
-- standard Supabase pattern is a non-public schema that PostgREST doesn't
-- expose; RLS can still call the functions via schema-qualified names because
-- we grant EXECUTE explicitly to anon + authenticated. SECURITY DEFINER is
-- preserved so the staff RLS recursion short-circuit still works.
--
-- rls_auto_enable is a Supabase-injected DDL event trigger function. Event
-- triggers fire from the system (not via EXECUTE on a role), so revoking
-- EXECUTE from anon + authenticated is safe and silences the same advisor.

-- ===== N1: pin search_path on the 3 INVOKER helpers we own =====
alter function public.lowercase_email() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.create_event_with_blocks(jsonb, jsonb) set search_path = public, pg_temp;

-- ===== N2: move auth helpers to app_private schema =====
create schema if not exists app_private;
-- USAGE needed by any role whose policies reference functions in this schema.
grant usage on schema app_private to postgres, anon, authenticated, service_role;

-- Policies referencing the unqualified function names must be dropped before
-- we drop the functions themselves. Recreated below with the qualified name.
drop policy if exists "staff_self_read" on public.staff;
drop policy if exists "agenda_blocks_manager_read_all" on public.agenda_blocks;
drop policy if exists "agenda_blocks_organizer_full" on public.agenda_blocks;
drop policy if exists "events_manager_read_all" on public.events;
drop policy if exists "events_organizer_select_own" on public.events;
drop policy if exists "events_organizer_insert_own" on public.events;
drop policy if exists "events_organizer_update_own" on public.events;
drop policy if exists "events_organizer_delete_own" on public.events;
drop policy if exists "registrations_manager_select_all" on public.registrations;
drop policy if exists "registrations_organizer_select_own" on public.registrations;
drop policy if exists "registrations_organizer_update_own" on public.registrations;

drop function if exists public.auth_email();
drop function if exists public.is_manager();
drop function if exists public.current_staff_id();

-- Recreate in app_private. Bodies identical to the original `init_staff` +
-- callsites (Data Model.md §Helper functions) but schema-qualified inside.
create function app_private.auth_email() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '') $$;

create function app_private.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email() and role = 'manager'
   ) $$;

create function app_private.current_staff_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.staff where email = app_private.auth_email() $$;

-- RLS policies invoke these as the calling role; EXECUTE must be granted.
grant execute on function app_private.auth_email()       to anon, authenticated, service_role;
grant execute on function app_private.is_manager()       to anon, authenticated, service_role;
grant execute on function app_private.current_staff_id() to anon, authenticated, service_role;

-- Recreate policies with schema-qualified function names.
-- Semantics are byte-identical to the originals; only the function reference changed.

create policy "staff_self_read" on public.staff
  for select
  using (email = app_private.auth_email() or app_private.is_manager());

create policy "agenda_blocks_manager_read_all" on public.agenda_blocks
  for select to authenticated
  using (app_private.is_manager());

create policy "agenda_blocks_organizer_full" on public.agenda_blocks
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = app_private.current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "events_manager_read_all" on public.events
  for select to authenticated
  using (app_private.is_manager());

create policy "events_organizer_select_own" on public.events
  for select to authenticated
  using (created_by = app_private.current_staff_id());

create policy "events_organizer_insert_own" on public.events
  for insert to authenticated
  with check (created_by = app_private.current_staff_id());

create policy "events_organizer_update_own" on public.events
  for update to authenticated
  using (created_by = app_private.current_staff_id())
  with check (created_by = app_private.current_staff_id());

create policy "events_organizer_delete_own" on public.events
  for delete to authenticated
  using (created_by = app_private.current_staff_id());

create policy "registrations_manager_select_all" on public.registrations
  for select to authenticated
  using (app_private.is_manager());

create policy "registrations_organizer_select_own" on public.registrations
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "registrations_organizer_update_own" on public.registrations
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = app_private.current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = app_private.current_staff_id()
  ));

-- ===== N2b: lock down the Supabase-injected event trigger function =====
-- Belt + braces: revoke from anon/authenticated AND from the PUBLIC pseudo-role
-- they inherit from. Postgres role inheritance means the direct revoke alone
-- leaves the privilege in place via PUBLIC. service_role + postgres keep
-- explicit grants (event-trigger machinery + dashboard tooling).
-- Portability guard (added 2026-07-10): rls_auto_enable is injected by the
-- HOSTED Supabase platform, so it exists on the live project but NOT on a clean
-- stack (local `supabase start`, or a fresh project provisioned by replaying
-- migrations — e.g. the planned Singapore project). Without this guard the whole
-- migration history is un-replayable from zero: the bare revoke errored with
-- 42883 "function does not exist". Found by the first clean replay-from-zero.
-- to_regprocedure() returns NULL instead of raising when the function is absent.
-- Seoul already applied the bare revoke (version-tracked, this edit does not
-- re-run there); fresh environments now skip it gracefully.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end $$;
