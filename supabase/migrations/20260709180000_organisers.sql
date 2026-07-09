-- CPD Sprint 3a — organisers. Q23 item 5: downstream of organisations,
-- sibling to accrediting_bodies (an entity can hold rows in both, e.g.
-- HKICPA accredits AND runs its own events).

create table public.organisers (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id),
  legal_name          text not null,
  display_name        text not null,
  organisation_type   text not null
                         check (organisation_type in (
                           'training_provider','professional_body','academic_institution',
                           'conference_producer','law_firm','accounting_firm',
                           'corporate_lnd','medical_society','other'
                         )),
  primary_body_id     uuid references public.accrediting_bodies(id),
  status              text not null default 'pending_verification'
                         check (status in ('active','suspended','pending_verification')),
  registration_number text,
  contact_email       text not null,
  billing_address     jsonb,
  created_at          timestamptz not null default now()
);

create index organisers_org_idx on public.organisers(organisation_id);
alter table public.organisers enable row level security;

-- ORG pattern, same shape as accrediting_bodies' staff-read policy.
create policy "organisers_org_staff_read" on public.organisers
  for select to authenticated
  using (exists (
    select 1 from public.staff
    where staff.organisation_id = organisers.organisation_id
      and staff.email = app_private.auth_email()
      and staff.status = 'active'
  ));

-- No public read: organiser records are not practitioner-facing the way
-- accrediting_bodies is (no "pick your organiser" flow exists).
