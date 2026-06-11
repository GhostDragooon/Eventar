-- Redesign gap G2: survey Q3 gains a 4th value-proposition option
-- ('event_format'). Slugs come from lib/surveyTemplate.ts; this CHECK is the
-- layer-3 mirror of the Zod enum. Recreate the constraint with the new slug.
alter table public.survey_responses drop constraint survey_value_proposition_ck;
alter table public.survey_responses add constraint survey_value_proposition_ck check (
  value_proposition is null or value_proposition in
    ('clinical_application','faculty_caliber','peer_collaboration','event_format'));
