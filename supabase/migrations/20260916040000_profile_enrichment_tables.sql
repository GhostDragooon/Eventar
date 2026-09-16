-- WP-B — Profile enrichment: additional appointments, society memberships,
-- degree/fellowship multi-select. Plan Phase 7 — ships after the account-
-- creation flow, consumed only by the profile page (ProfileClient.tsx), not
-- the completion gate. No organisation_id on either new table: per-user
-- profile data, not per-tenant domain data (same posture as
-- professional_profiles itself).

create table public.additional_appointments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  institution_name  text not null,
  title             text not null,
  display_order     int not null default 0,
  created_at        timestamptz not null default now()
);

create index additional_appointments_user_idx on public.additional_appointments(user_id);

comment on table public.additional_appointments is
  'Repeatable institution+title rows, profile-page enrichment only (write-up WP-B). Not part of the account-creation required set.';

alter table public.additional_appointments enable row level security;

create policy "additional_appointments_self_read" on public.additional_appointments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "additional_appointments_self_insert" on public.additional_appointments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "additional_appointments_self_update" on public.additional_appointments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "additional_appointments_self_delete" on public.additional_appointments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Staff read mirrors professional_profiles_staff_read (organiser_admin or
-- eventar_staff, per app_private.is_manager()'s 20260709150000 remap).
create policy "additional_appointments_staff_read" on public.additional_appointments
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

revoke all on table public.additional_appointments from public, anon;
grant select, insert, update, delete on table public.additional_appointments to authenticated;
grant all on table public.additional_appointments to service_role;

create table public.society_memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  society_code  text not null references public.societies(code),
  role_title    text,
  created_at    timestamptz not null default now(),
  unique (user_id, society_code)
);

create index society_memberships_user_idx on public.society_memberships(user_id);

comment on table public.society_memberships is
  'Society/association role capture, profile-page enrichment only (write-up WP-B). role_title is free text (e.g. Council Member, Fellow) — no controlled list for roles this slice.';

alter table public.society_memberships enable row level security;

create policy "society_memberships_self_read" on public.society_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "society_memberships_self_insert" on public.society_memberships
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "society_memberships_self_update" on public.society_memberships
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "society_memberships_self_delete" on public.society_memberships
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "society_memberships_staff_read" on public.society_memberships
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

revoke all on table public.society_memberships from public, anon;
grant select, insert, update, delete on table public.society_memberships to authenticated;
grant all on table public.society_memberships to service_role;

-- ---------------------------------------------------------------------------
-- professional_profiles.degree_codes — multi-select of public.degrees
-- codes. text[] rather than a join table: this is a small, order-
-- insensitive set of controlled values on a 1:1 profile row, not an entity
-- with its own lifecycle (unlike appointments/society memberships, which
-- have a role/title per row worth keeping a row identity for).
-- FK arrays aren't practical in Postgres — validation of each element
-- against public.degrees happens at the Zod/server-action layer, same
-- posture as the existing expertise_codes/presentation_languages arrays
-- already on this table (20260829090000).
-- ---------------------------------------------------------------------------
alter table public.professional_profiles
  add column if not exists degree_codes text[];

comment on column public.professional_profiles.degree_codes is
  'Multi-select of public.degrees codes. Free-text degrees not in the controlled list go here too (write-up §3.5: "multi-select of common values + free text allowed") — the app layer does not reject an unrecognised code, it just won''t resolve a label for it.';

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.additional_appointments', 'SELECT')
     or has_table_privilege('anon', 'public.additional_appointments', 'INSERT') then
    raise exception 'profile_enrichment self-check: anon must not access additional_appointments';
  end if;
  if has_table_privilege('anon', 'public.society_memberships', 'SELECT')
     or has_table_privilege('anon', 'public.society_memberships', 'INSERT') then
    raise exception 'profile_enrichment self-check: anon must not access society_memberships';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'professional_profiles' and column_name = 'degree_codes'
  ) then
    raise exception 'profile_enrichment self-check: professional_profiles.degree_codes missing';
  end if;
end $$;
