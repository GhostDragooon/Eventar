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
