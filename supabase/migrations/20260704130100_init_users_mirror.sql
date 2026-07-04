-- CPD Sprint 1 / M2 — public.users: application mirror of auth.users.
-- users.id ALWAYS equals auth.users.id. Attendees/speakers/staff humans
-- all live here. phone_encrypted deferred to Sprint 4 (KMS envelope).

create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  locale           text not null default 'en',
  timezone         text not null default 'Asia/Hong_Kong',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  pseudonymised_at timestamptz
);

create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

alter table public.users enable row level security;

create policy "users_self_read" on public.users
  for select to authenticated
  using (id = auth.uid());

create policy "users_self_update" on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_staff_read" on public.users
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

-- Mirror trigger: every new auth user gets a public.users row.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  insert into public.users (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill the existing auth user(s).
insert into public.users (id, full_name)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;
