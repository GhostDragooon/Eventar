-- ---------------------------------------------------------------------------
-- REPLAY BOOTSTRAP — added 2026-08-10. Makes replay-from-zero work off-platform.
--
-- Hosted Supabase ships default privileges so that a table CREATEd in `public`
-- carries DML for anon/authenticated/service_role. The local CLI (2.109) ships
-- them only for tables created by `supabase_admin`; for `postgres` — which is
-- who runs migrations — it grants `Dxtm` (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
-- and NO select/insert/update/delete. Measured on the local stack:
--
--   postgres|r|{anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}
--
-- Several later migrations self-verify that those grants exist before revoking
-- narrowly — e.g. 20260802182411 raises "over-revoked: service_role lost its
-- events write path", 20260803090000 the same for email_log/rate_limits. On
-- hosted they pass because the platform granted; on a fresh local/CI replay
-- they fire against a database that was never granted, so `supabase db reset`
-- fails and the replay-verify CI job goes red.
--
-- The fix belongs HERE, not in the CI script: `supabase start` applies
-- migrations itself, so a harness-level grant would run too late. It does not
-- belong in seed.sql either — `db reset` runs seed AFTER every migration.
--
-- This is additive and idempotent, it re-states what the platform already does
-- (so it is a no-op on Seoul, which ran this migration long ago), and it does
-- NOT weaken Hard Rule 11: default privileges only set a table's INITIAL grant,
-- and every audited table's explicit REVOKE still runs after its CREATE.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Helper: read JWT email claim.
-- Lives in its own migration so later migrations can depend on it.
create or replace function public.auth_email() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','') $$;

-- staff: email -> role. Source of truth for who can use the app.
-- Keyed on email (not auth.users.id) so MS-SSO migration later is a config flip.
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  full_name  text,
  role       text not null check (role in ('organizer','manager')),
  created_at timestamptz not null default now()
);

-- Lowercase + trim email on every write.
create or replace function public.lowercase_email() returns trigger
  language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
create trigger staff_lowercase_email
  before insert or update on public.staff
  for each row execute function public.lowercase_email();

create or replace function public.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(select 1 from public.staff where email = auth_email() and role = 'manager') $$;

create or replace function public.current_staff_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.staff where email = auth_email() $$;

alter table public.staff enable row level security;

create policy "staff_self_read" on public.staff
  for select using (email = auth_email() or is_manager());
-- No write policy: staff inserts happen via service-role only (seed or admin UI).
