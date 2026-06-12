-- Redesign gap G1: survey Q2 converts from free-text to session
-- multiple-choice. The answer is an agenda block of the response's event, or
-- "General sessions / overall" (valuable_overall). No prod data yet, so the
-- key_highlights drop is clean (its length CHECK drops with the column).
-- Cross-event ownership (block.event_id = response.event_id) is enforced in
-- the Server Action — a plain FK can't express it.
alter table public.survey_responses
  add column valuable_block_id uuid null references public.agenda_blocks(id) on delete set null,
  add column valuable_overall  boolean not null default false;
alter table public.survey_responses drop column key_highlights;
comment on column public.survey_responses.valuable_block_id is
  'Q2: most valuable session. NULL + valuable_overall=false → unanswered; NULL + true → "General sessions / overall".';
