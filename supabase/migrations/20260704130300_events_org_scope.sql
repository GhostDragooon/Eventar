-- CPD Sprint 1 / M4 — events adopt the default organisation.
-- The column default stays until multi-org event creation ships
-- (Sprint 3+); existing Server Actions and RPCs keep working unchanged.
-- Org-scoped RLS predicates arrive with JWT org claims in Sprint 2;
-- today's owner/manager policies remain the enforcement.

alter table public.events
  add column organisation_id uuid not null
    default '00000000-0000-0000-0000-000000000001'
    references public.organisations(id);

create index events_organisation_idx on public.events (organisation_id);
