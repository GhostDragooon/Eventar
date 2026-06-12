-- G3 (2026-06-11 redesign): speaker/host check-in toggles on the Team-Checkin
-- page. Speakers are NOT a table — names derive at render time from
-- agenda_blocks (block host + topic speaker_names, deduped; see
-- lib/agenda.ts::deriveSpeakerNames). This table only records toggle state,
-- keyed on (event_id, speaker_name).
create table public.speaker_checkins (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  speaker_name  text not null check (speaker_name = btrim(speaker_name) and char_length(speaker_name) between 1 and 120),
  checked_in_at timestamptz,
  updated_by    uuid references public.staff(id),
  unique (event_id, speaker_name)
);

-- No separate event_id index: the unique (event_id, speaker_name) constraint
-- creates a btree whose event_id prefix already serves the per-event lookup.

alter table public.speaker_checkins enable row level security;

-- Policies mirror the registrations staff policies in their LATEST hardened
-- shape (20260521010000_fix_security_lints.sql — app_private-qualified
-- helpers): owner select/insert/update, manager select. Unlike registrations
-- there is no anon write path — staff create the toggle rows themselves — so
-- there are NO anon policies at all (RLS default-deny) and no DELETE policy
-- (toggle-off clears checked_in_at; rows are never deleted by the app).

create policy "speaker_checkins_organizer_select_own"
  on public.speaker_checkins
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "speaker_checkins_organizer_insert_own"
  on public.speaker_checkins
  for insert to authenticated
  with check (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "speaker_checkins_organizer_update_own"
  on public.speaker_checkins
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id and e.created_by = app_private.current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "speaker_checkins_manager_select_all"
  on public.speaker_checkins
  for select to authenticated
  using (app_private.is_manager());
