-- Stage A — Account + Professional Profile (first slice)
-- Implements Eventar_Account_Professional_Profile_Execution_Plan §4 + §9 Stage A.
--
-- A1  Extend public.users with structured name + optional phone/country
-- A2  Create public.professional_profiles (1:1 with users) + RLS + grants
-- A3  Extend public.registrations with user_id, profile_snapshot, source
-- A4  Existing rows remain user_id NULL / profile_snapshot NULL (no destructive backfill)
--
-- Non-goals in this migration: claim function, award-gate changes, UI, society table.
-- Hard Rules: 3 (audit last when we write), 10 (no PII in logs), 11 (grants + RLS).

-- ---------------------------------------------------------------------------
-- A1. public.users — structured name + optional contact
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists first_name         text,
  add column if not exists last_name          text,
  add column if not exists salutation         text,
  add column if not exists phone              text,
  add column if not exists phone_country_code text,
  add column if not exists country_code       text;

comment on column public.users.first_name is
  'Structured given name. Optional at schema level; encouraged in UI. full_name remains canonical for display/email/roster.';
comment on column public.users.last_name is
  'Structured family name. Optional at schema level; encouraged in UI.';
comment on column public.users.salutation is
  'Controlled list in app layer (Dr, Prof, Mr, Ms, …). Not enforced by CHECK in this slice.';
comment on column public.users.phone is
  'Optional. E.164 preferred later. No OTP in this slice. Hard Rule 10 applies.';
comment on column public.users.phone_country_code is
  'Optional ISO dialling prefix companion to phone.';
comment on column public.users.country_code is
  'Optional ISO 3166-1 alpha-2.';

-- full_name stays NOT NULL. Application may refresh full_name from
-- first_name + last_name on write when both present; never blank full_name.

-- ---------------------------------------------------------------------------
-- A2. public.professional_profiles — Layer B (1:1 with users)
-- ---------------------------------------------------------------------------
create table if not exists public.professional_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique references public.users(id) on delete cascade,
  workplace_text              text,
  workplace_organisation_id   uuid,          -- reserved for future directory FK
  position_code               text,          -- controlled + Other
  position_other              text,
  profession_code             text,          -- controlled taxonomy
  specialty_code              text,
  specialty_other             text,
  department_text             text,
  biography                   text,
  expertise_codes             text[],
  presentation_languages      text[],
  speaker_discovery_opt_in    boolean not null default false,
  speaker_discovery_opt_in_at timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger professional_profiles_touch_updated_at
  before update on public.professional_profiles
  for each row execute function public.touch_updated_at();

create index if not exists professional_profiles_user_idx
  on public.professional_profiles (user_id);

comment on table public.professional_profiles is
  'Layer B professional identity. One row per user. Licences remain on practitioner_licences (profile owns them as product language). Society membership table deferred.';

alter table public.professional_profiles enable row level security;

-- Self read / update (authenticated owner only)
create policy "professional_profiles_self_read"
  on public.professional_profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy "professional_profiles_self_insert"
  on public.professional_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "professional_profiles_self_update"
  on public.professional_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Staff read (manager / eventar_staff) — mirrors users_staff_read / consent_staff_read
create policy "professional_profiles_staff_read"
  on public.professional_profiles
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

-- No public/anon access. No client DELETE (soft-delete via users.deleted_at if needed later).
-- Grant hygiene: revoke PUBLIC first (Hard Rule 11), then grant only what PostgREST roles need.
revoke all on table public.professional_profiles from public, anon;
grant select, insert, update on table public.professional_profiles to authenticated;
grant all on table public.professional_profiles to service_role;

-- Self-verify grants do not leak to anon
do $$
begin
  if has_table_privilege('anon', 'public.professional_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.professional_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.professional_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.professional_profiles', 'DELETE') then
    raise exception 'grant hygiene failed: professional_profiles still accessible to anon';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A3. public.registrations — link + snapshot + source
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column if not exists user_id          uuid references public.users(id),
  add column if not exists profile_snapshot jsonb,
  add column if not exists source           text
    check (source is null or source in (
      'self_registration',
      'staff_walk_in',
      'invitation_import',
      'system_migration'
    ));

comment on column public.registrations.user_id is
  'Nullable FK. Set on register-while-logged-in or claim. Guest / walk-in remain null until claim.';
comment on column public.registrations.profile_snapshot is
  'Immutable JSON snapshot of relevant profile fields at registration (or first claim if previously null). Never overwrite non-null. Shape: full_name, first_name, last_name, salutation, workplace_text, position_code, position_other, profession_code, specialty_code, licence_summaries[], snapshotted_at.';
comment on column public.registrations.source is
  'Origin of the registration row. staff_walk_in for door path; self_registration for public form.';

create index if not exists registrations_user_id_idx
  on public.registrations (user_id)
  where user_id is not null;

-- A4. No destructive backfill. Existing rows keep user_id null, profile_snapshot null.
-- Claim path (Stage B) will set them later.

-- ---------------------------------------------------------------------------
-- Notes for Stage B (not in this migration)
-- ---------------------------------------------------------------------------
-- - claim_registrations_for_user / register-while-logged-in must be the only
--   writers of registrations.user_id and profile_snapshot (definer or trusted
--   Server Action). Guest must not set arbitrary user_id.
-- - profile_snapshot is immutable from client: no direct UPDATE policy for it.
-- - award_attendance_credit gate (F1–F5) lands in Stage B4.
