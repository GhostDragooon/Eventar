-- CPD Sprint 3a — accrediting_bodies. Q23 item 5 (organisations is the
-- tenancy base; this is a downstream table). text+CHECK per Rule 2,
-- gen_random_uuid() per Rule 2 — both deviate from Data Model.md's drafted
-- enum/uuid_generate_v4(), see Rule 2 for why.
--
-- Deviation from plan text (approved pre-execution): retention_years is
-- nullable (default 6 kept for bodies where a real value is known). Task 7
-- (seeding) needs NULL for at least one body (HKIE) where no source states
-- a retention figure — forcing an unsourced default would misrepresent it.

create table public.accrediting_bodies (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id),
  short_name        text not null,
  full_name         text not null,
  parent_body_id    uuid references public.accrediting_bodies(id),
  jurisdiction      text not null default 'HK',
  cycle_config      jsonb not null,
  category_taxonomy jsonb not null,
  retention_years   integer default 6,
  status            text not null default 'onboarding'
                       check (status in ('active','onboarding','deferred')),
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index accrediting_bodies_org_idx on public.accrediting_bodies(organisation_id);
create index accrediting_bodies_parent_idx on public.accrediting_bodies(parent_body_id);

alter table public.accrediting_bodies enable row level security;

-- ORG pattern (Auth Flow#JWT claims and RLS reliance): staff of the owning org.
create policy "accrediting_bodies_org_staff_read" on public.accrediting_bodies
  for select to authenticated
  using (exists (
    select 1 from public.staff
    where staff.organisation_id = accrediting_bodies.organisation_id
      and staff.email = app_private.auth_email()
      and staff.status = 'active'
  ));

-- Public read on active bodies (name/status only surfaced at the app layer)
-- for the practitioner-facing "declare your licence" picker.
create policy "accrediting_bodies_public_read_active" on public.accrediting_bodies
  for select to anon, authenticated
  using (status = 'active');

-- No INSERT/UPDATE/DELETE policy: body management is service-role/internal-admin
-- only at launch (service_role bypasses RLS). Revisit if organiser-side
-- self-service body management ever ships.
