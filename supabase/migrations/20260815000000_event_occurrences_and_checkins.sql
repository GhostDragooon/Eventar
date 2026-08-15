-- Task 10.8/10.9, sub-task C1 of 5 — event_occurrences + registration_checkins.
-- Schema + backfill only. C2 wires the actual check-in writer RPCs; this
-- migration builds no new write surface for anon/authenticated/service_role.
-- Design authority: docs/adr/0002-multi-body-accreditation.md
-- "Storage shape" + "Attendance units" sections.
--
-- NOT THE DEFERRED MULTI-TRACK MODEL (repo rule 13). Occurrences are flat,
-- sequential, and non-overlapping — one timeline per event. Multi-track means
-- *concurrent* sessions a practitioner chooses between, with per-track
-- capacity/conflict rules; nothing here builds or reopens that. The
-- non-overlap constraint below is exactly what keeps the two concepts apart:
-- a multi-track schema would need to ALLOW two occurrences of one event to
-- overlap in time (parallel tracks), and this schema structurally forbids it.
--
-- COMPATIBILITY. registrations.check_in_at / check_in_method stay as legacy
-- summary columns (comment on column, below), kept in sync by trigger from
-- the earliest registration_checkins row. All existing readers of those two
-- columns (grepped: app/dashboard/page.tsx, app/(public)/checkin/confirm/
-- page.tsx, app/events/[id]/details/page.tsx, app/events/[id]/analytics/
-- page.tsx, app/events/[id]/checkin/actions.ts, app/events/[id]/checkin/
-- page.tsx, app/events/[id]/checkin/RosterClient.tsx,
-- lib/analytics/arrivalLatency.ts, components/details/AttendanceSection.tsx
-- — 9 files; the ADR's "eight" narrative figure undercounts by one, see the
-- handoff for the specific file) keep working untouched, including
-- RosterClient's Realtime subscription — the trigger's UPDATE on
-- registrations is itself what fires that table's postgres_changes event.

-- btree_gist supplies the uuid equality operator class GiST needs to combine
-- with the native tstzrange overlap operator in the EXCLUDE constraint below.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- event_occurrences
-- ---------------------------------------------------------------------------
create table public.event_occurrences (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  ordinal            integer not null check (ordinal > 0),
  occurrence_type    text not null check (occurrence_type in ('day','half_day','session')),
  name               text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null check (ends_at > starts_at),
  attendance_points  integer not null default 1 check (attendance_points > 0),
  unique (event_id, ordinal),
  -- Flat timeline enforcement: no two occurrences of the SAME event may
  -- overlap in [starts_at, ends_at). Half-open range so back-to-back
  -- occurrences (one ends exactly when the next starts) are NOT overlaps —
  -- this is what "sequential" means, distinct from "concurrent" (multi-track).
  exclude using gist (
    event_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index event_occurrences_event_idx on public.event_occurrences(event_id);

alter table public.event_occurrences enable row level security;

-- RLS shape follows agenda_blocks (20260516104612_init_agenda_blocks.sql) —
-- the closest existing per-event schedule child table, not registrations:
-- occurrences are event-level scheduling metadata (day/session boundaries),
-- not attendee PII, so a published event's occurrences are public-readable
-- the same way its agenda is.
create policy "event_occurrences_public_read_when_event_published"
  on public.event_occurrences
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_occurrences.event_id and e.status = 'published'
  ));

create policy "event_occurrences_organizer_select_own"
  on public.event_occurrences
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_occurrences.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "event_occurrences_manager_select_all"
  on public.event_occurrences
  for select to authenticated
  using (app_private.is_manager());

-- No INSERT/UPDATE/DELETE RLS policies. C2 hasn't built the writer RPCs yet;
-- see the table-level REVOKE below — a write policy here would be dead code
-- since the grant blocks the write before RLS is ever evaluated.

-- ---------------------------------------------------------------------------
-- registration_checkins
-- ---------------------------------------------------------------------------
create table public.registration_checkins (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.registrations(id) on delete cascade,
  -- No ON DELETE action on occurrence_id: deleting an occurrence that already
  -- has checkins against it is blocked (default RESTRICT) rather than
  -- silently destroying attendance evidence.
  occurrence_id    uuid not null references public.event_occurrences(id),
  checked_in_at    timestamptz not null default now(),
  check_in_method  text check (check_in_method in ('qr','manual')),
  unique (registration_id, occurrence_id)
);

create index registration_checkins_registration_idx on public.registration_checkins(registration_id);
create index registration_checkins_occurrence_idx on public.registration_checkins(occurrence_id);

alter table public.registration_checkins enable row level security;

-- RLS shape follows registrations itself: no anon read at all (PII/attendance
-- record), organizer reads their own event's checkins via the
-- registration -> event ownership chain, manager reads all.
create policy "registration_checkins_organizer_select_own"
  on public.registration_checkins
  for select to authenticated
  using (exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = registration_checkins.registration_id
      and e.created_by = app_private.current_staff_id()
  ));

create policy "registration_checkins_manager_select_all"
  on public.registration_checkins
  for select to authenticated
  using (app_private.is_manager());

-- No INSERT/UPDATE/DELETE RLS policies — same reasoning as event_occurrences.

-- ---------------------------------------------------------------------------
-- Hard Rule 11 grant posture: definer-only, no direct writes for ANY app
-- role including service_role (service_role has BYPASSRLS — RLS above gives
-- it zero protection; only this REVOKE does). C2's check-in RPCs will be
-- SECURITY DEFINER, owned by the table owner, so they are unaffected by this
-- REVOKE exactly like record_credit_entry/declare_licence are today.
-- No role is granted a retained DELETE (unlike practitioner_licences) —
-- there is no cleanup/erasure need for these tables yet; add one the same
-- way 20260709320000 did, if C2 or a DSR path needs it.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.event_occurrences from anon, authenticated, service_role;
revoke insert, update, delete on public.registration_checkins from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auto-create exactly one occurrence spanning start_time -> end_time whenever
-- a new event is inserted. SECURITY DEFINER (table owner) so it succeeds
-- regardless of the inserting role's own grants on event_occurrences — same
-- precedent as freeze_cpd_config_if_credited (20260725073250) needing
-- definer rights to see across RLS boundaries the triggering role can't.
-- ---------------------------------------------------------------------------
create or replace function public.create_default_event_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
  values (new.id, 1, 'day', new.start_time, new.end_time);
  return new;
end;
$$;

revoke all on function public.create_default_event_occurrence() from public, anon, authenticated;

create trigger events_create_default_occurrence
  after insert on public.events
  for each row execute function public.create_default_event_occurrence();

-- ---------------------------------------------------------------------------
-- Summary trigger: keep registrations.check_in_at / check_in_method equal to
-- the EARLIEST registration_checkins row for that registration, across all
-- its occurrences. Fires on INSERT or UPDATE of registration_checkins (spec:
-- delete is not part of normal operation for these rows, so no AFTER DELETE
-- trigger — see the migration comment above for the intended write path).
-- ---------------------------------------------------------------------------
create or replace function public.sync_registration_checkin_summary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  earliest record;
begin
  select checked_in_at, check_in_method
  into earliest
  from public.registration_checkins
  where registration_id = new.registration_id
  order by checked_in_at asc
  limit 1;

  update public.registrations
  set check_in_at = earliest.checked_in_at,
      check_in_method = earliest.check_in_method
  where id = new.registration_id;

  return new;
end;
$$;

revoke all on function public.sync_registration_checkin_summary() from public, anon, authenticated;

create trigger registration_checkins_sync_summary
  after insert or update on public.registration_checkins
  for each row execute function public.sync_registration_checkin_summary();

-- registrations.check_in_at / check_in_method become legacy summary fields,
-- maintained by the trigger above. registration_checkins is the
-- authoritative attendance record (ADR-0002 "Storage shape" +
-- "Compatibility").
comment on column public.registrations.check_in_at is
  'LEGACY SUMMARY FIELD. Maintained by sync_registration_checkin_summary() as '
  'the earliest registration_checkins.checked_in_at for this registration. '
  'Not the source of truth for anything award-related — read '
  'registration_checkins instead. See docs/adr/0002-multi-body-accreditation.md.';

comment on column public.registrations.check_in_method is
  'LEGACY SUMMARY FIELD. Maintained by sync_registration_checkin_summary() as '
  'the check_in_method of the earliest registration_checkins row for this '
  'registration. Not the source of truth — read registration_checkins '
  'instead. See docs/adr/0002-multi-body-accreditation.md.';

-- ---------------------------------------------------------------------------
-- Backfill. One event_occurrences row per EXISTING event (the AFTER INSERT
-- trigger only fires for events created from now on). One
-- registration_checkins row per existing registration with a non-null
-- check_in_at, linked to that event's now-backfilled single occurrence.
-- ---------------------------------------------------------------------------
insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
select id, 1, 'day', start_time, end_time
from public.events;

insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
select r.id, eo.id, r.check_in_at, r.check_in_method
from public.registrations r
join public.event_occurrences eo on eo.event_id = r.event_id and eo.ordinal = 1
where r.check_in_at is not null;
