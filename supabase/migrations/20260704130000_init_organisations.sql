-- CPD Sprint 1 / M1 — organisations: the tenancy root.
-- Deltas ref: docs/architecture/BASELINE-DELTAS.md §2 (Eventar naming),
-- repo convention: text + CHECK, not enums.

create table public.organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  status       text not null default 'active'
                 check (status in ('active','suspended','archived')),
  jurisdiction text not null default 'HK',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger organisations_touch_updated_at
  before update on public.organisations
  for each row execute function public.touch_updated_at();

create index organisations_status_idx on public.organisations (status);

alter table public.organisations enable row level security;

-- Helper: is the caller an active eventar_staff (internal operator)?
-- Mirrors app_private.is_manager(); status filter arrives in M3 but the
-- staff.status column does not exist yet, so this first version checks
-- role only. M3 recreates it with the status filter.
create function app_private.is_eventar_staff() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email() and role = 'eventar_staff'
   ) $$;

grant execute on function app_private.is_eventar_staff()
  to anon, authenticated, service_role;

-- Members of an organisation can read it; internal operators read all.
-- organisation_id lands on staff in M3; until then this policy resolves
-- via is_manager() (single-org world) and is tightened in M3.
create policy "organisations_staff_read" on public.organisations
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff()
         or app_private.current_staff_id() is not null);

-- No INSERT/UPDATE/DELETE policies: organisation management is a
-- service-role/internal-admin operation (service_role has BYPASSRLS).

-- Seed the default organisation that adopts all existing Eventar data.
insert into public.organisations (id, name, slug, status, jurisdiction)
values ('00000000-0000-0000-0000-000000000001',
        'Default Organisation', 'default', 'active', 'HK');
