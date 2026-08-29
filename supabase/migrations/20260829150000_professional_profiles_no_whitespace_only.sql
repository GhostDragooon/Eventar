-- Stage D / follow-up 2 — close F3 whitespace bypass.
--
-- D4 dev-lens re-review IMPORTANT 2. The F3 evaluator in 20260829120000
-- uses `nullif(v_pp.workplace_text, '')` which returns the value
-- unchanged for a whitespace-only string ('   ', '\n', etc.), letting a
-- caller satisfy F3 by posting three spaces. Two-layer close:
--
--   1. Zod schema tightens the input side (see app/account/schema.ts —
--      trim + min(1) on workplace_text / position_code / position_other /
--      profession_code / specialty_code / specialty_other).
--
--   2. This migration adds DB-level CHECK constraints so no whitespace-
--      only value can be stored regardless of writer (Server Action,
--      future definer, ad-hoc admin fix). NULL is still allowed — the
--      constraint only fires on non-null values that are empty after
--      btrim.
--
-- Fresh db reset carries zero rows so no backfill is needed. Any future
-- environment adopting this migration with existing whitespace-only rows
-- would need a backfill first — surfaced via the constraint's own error
-- rather than a silent gate bypass.

alter table public.professional_profiles
  add constraint pp_workplace_text_not_whitespace
    check (workplace_text is null or btrim(workplace_text) <> ''),
  add constraint pp_position_code_not_whitespace
    check (position_code is null or btrim(position_code) <> ''),
  add constraint pp_position_other_not_whitespace
    check (position_other is null or btrim(position_other) <> ''),
  add constraint pp_profession_code_not_whitespace
    check (profession_code is null or btrim(profession_code) <> ''),
  add constraint pp_specialty_code_not_whitespace
    check (specialty_code is null or btrim(specialty_code) <> ''),
  add constraint pp_specialty_other_not_whitespace
    check (specialty_other is null or btrim(specialty_other) <> ''),
  add constraint pp_department_text_not_whitespace
    check (department_text is null or btrim(department_text) <> ''),
  add constraint pp_workplace_organisation_or_text
    check (true); -- placeholder for a future organisation-vs-text mutex if needed

do $$
begin
  -- Positive: a real value passes.
  perform 1 where btrim('Test Hospital') <> '';
  -- Negative: whitespace-only would fail. Prove the check idea holds.
  if btrim('   ') <> '' then
    raise exception 'stage-d follow-up 2: btrim did not collapse whitespace as expected';
  end if;
  raise notice 'stage-d follow-up 2: professional_profiles whitespace CHECKs in place';
end $$;
