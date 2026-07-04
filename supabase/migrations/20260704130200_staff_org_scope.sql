-- CPD Sprint 1 / M3 — staff becomes organisation-scoped.
-- Q20 reversed decision 6.3 (single-org). Roles organizer/manager kept
-- (frontend frozen); eventar_staff added for internal-operator policies.

alter table public.staff
  add column organisation_id uuid not null
    default '00000000-0000-0000-0000-000000000001'
    references public.organisations(id),
  add column status text not null default 'active'
    check (status in ('invited','active','suspended','removed'));

-- email was globally unique; now unique per organisation.
-- Constraint names verified live: staff_email_key / staff_role_check.
alter table public.staff drop constraint staff_email_key;
alter table public.staff add constraint staff_email_org_key
  unique (email, organisation_id);

alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('organizer','manager','eventar_staff'));

create index staff_org_active_idx
  on public.staff (organisation_id, status) where status = 'active';

-- Harden helpers: removed/suspended staff must lose access immediately.
-- limit 1 + created_at ordering keeps current_staff_id deterministic if a
-- user later holds staff rows in multiple organisations; proper org
-- selection arrives with JWT org claims in Sprint 2.
create or replace function app_private.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and role = 'manager' and status = 'active'
   ) $$;

create or replace function app_private.current_staff_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.staff
   where email = app_private.auth_email() and status = 'active'
   order by created_at limit 1 $$;

create or replace function app_private.is_eventar_staff() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and role = 'eventar_staff' and status = 'active'
   ) $$;

-- Tighten the organisations read policy now that staff carries the org id.
drop policy "organisations_staff_read" on public.organisations;
create policy "organisations_staff_read" on public.organisations
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.staff
      where staff.email = app_private.auth_email()
        and staff.organisation_id = organisations.id
        and staff.status = 'active'
    )
  );
