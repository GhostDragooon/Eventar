-- Phase 2: anon visitors register for published events.
-- See docs/plans/2026-05-20-mvp-gap.md "Phase 2 — Registration flow" + the
-- inline-form design discussed before this migration.
create table public.registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  email         text not null,
  full_name     text not null,
  status        text not null default 'registered'
                check (status in ('registered','attended','cancelled')),
  registered_at timestamptz not null default now(),
  -- Per-event email uniqueness gives the "you're already registered" error
  -- a clean DB-level enforcement point. The Server Action surfaces it as a
  -- friendly message; the unique constraint is the source of truth.
  unique (event_id, email)
);

create index registrations_event_idx on public.registrations(event_id);

-- Reuse the lowercase-email trigger function defined in init_staff.
create trigger registrations_lowercase_email
  before insert or update on public.registrations
  for each row execute function public.lowercase_email();

alter table public.registrations enable row level security;

-- ANON INSERT: allowed only when the event is published.
-- The WITH CHECK clause subquery is evaluated per-insert; no RLS recursion
-- risk because events has its own anon-published-read policy.
create policy "registrations_anon_insert_when_event_published"
  on public.registrations
  for insert to anon, authenticated
  with check (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.status = 'published'
  ));

-- ANON SELECT: blocked. Registration data is PII.
-- (No SELECT policy for anon means no anon reads — RLS default-deny.)

-- ORGANIZER SELECT / UPDATE on their own event's registrations.
create policy "registrations_organizer_select_own"
  on public.registrations
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = current_staff_id()
  ));

create policy "registrations_organizer_update_own"
  on public.registrations
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = registrations.event_id and e.created_by = current_staff_id()
  ));

-- MANAGER SELECT all.
create policy "registrations_manager_select_all"
  on public.registrations
  for select to authenticated
  using (is_manager());
