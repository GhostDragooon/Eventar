-- CPD Sprint 3a — practitioner_licences. Q23 item 6: keyed on users.id
-- directly (no practitioners table). Ledger keys on licence_id, not
-- user_id (Credit Ledger §1 design principle) — different bodies have
-- different cycles/units/floors, and a licence can lapse at one body
-- without affecting another.

create table public.practitioner_licences (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id),
  body_id               uuid not null references public.accrediting_bodies(id),
  licence_number        text not null,
  licence_type          text,
  is_primary            boolean not null default false,
  status                text not null default 'declared'
                           check (status in ('declared','verified','lapsed','revoked','superseded')),
  declared_at           timestamptz not null default now(),
  verified_at           timestamptz,
  lapsed_at             timestamptz,
  revoked_at            timestamptz,
  superseded_by         uuid references public.practitioner_licences(id),
  cycle_start_override  date,
  cycle_config_override jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, body_id, licence_number)
);

create trigger practitioner_licences_touch_updated_at
  before update on public.practitioner_licences
  for each row execute function public.touch_updated_at();

-- At most one is_primary = true per user_id.
create unique index practitioner_licences_one_primary_idx
  on public.practitioner_licences(user_id) where is_primary;

create index practitioner_licences_user_idx on public.practitioner_licences(user_id);
create index practitioner_licences_body_idx on public.practitioner_licences(body_id);

alter table public.practitioner_licences enable row level security;

-- No organisation_id (cross-tenant, mirrors users). SELF + ORG(body_admin) per
-- Data Model.md's own note on this table.
create policy "practitioner_licences_self_read" on public.practitioner_licences
  for select to authenticated
  using (user_id = auth.uid());

create policy "practitioner_licences_self_write" on public.practitioner_licences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Body-admin staff (of the owning organisation for that body) read for verification.
create policy "practitioner_licences_body_admin_read" on public.practitioner_licences
  for select to authenticated
  using (exists (
    select 1 from public.accrediting_bodies ab
    join public.staff s on s.organisation_id = ab.organisation_id
    where ab.id = practitioner_licences.body_id
      and s.email = app_private.auth_email()
      and s.status = 'active'
      and s.role in ('body_admin','eventar_staff')
  ));
