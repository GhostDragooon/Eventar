-- Phase 5: survey responses. One per registration. Anon submits via the
-- service-role admin client (no anon RLS policy); code is the bearer token.
-- Columns store stable slugs from lib/surveyTemplate.ts; CHECK constraints pin
-- them (layer-3 validation). The future survey builder owns relaxing these.
create table public.survey_responses (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    uuid not null unique references public.registrations(id) on delete cascade,
  event_id           uuid not null references public.events(id) on delete cascade,
  session_format     text,
  key_highlights     text,
  value_proposition  text,
  expectations       text,
  future_preferences text[] not null default '{}',
  submitted_at       timestamptz not null default now(),
  constraint survey_session_format_ck check (
    session_format is null or session_format in
      ('scientific_presentations','clinical_panels','interactive_qa','peer_networking')),
  constraint survey_value_proposition_ck check (
    value_proposition is null or value_proposition in
      ('clinical_application','faculty_caliber','peer_collaboration')),
  constraint survey_expectations_ck check (
    expectations is null or expectations in
      ('exceeded','met','partially','not_met')),
  constraint survey_future_preferences_ck check (
    future_preferences <@ array[
      'expanded_qa','increased_clinical_depth','structured_networking','subspecialty_topics'
    ]::text[]),
  constraint survey_key_highlights_len_ck check (
    key_highlights is null or char_length(key_highlights) <= 2000)
);

create index survey_responses_event_idx on public.survey_responses(event_id);

alter table public.survey_responses enable row level security;

-- No anon/public policies -> public denied (RLS default-deny). Writes go through
-- supabaseAdmin (service role bypasses RLS).

-- ORGANIZER SELECT on their own event's survey responses.
create policy "survey_organizer_select_own"
  on public.survey_responses
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = survey_responses.event_id and e.created_by = app_private.current_staff_id()
  ));

-- MANAGER SELECT all.
create policy "survey_manager_select_all"
  on public.survey_responses
  for select to authenticated
  using (app_private.is_manager());
