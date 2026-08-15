-- Task 10.2/10.9 + M2 — a practitioner can hold is_primary = true at MORE
-- THAN ONE accrediting body simultaneously (one primary per body, not one
-- primary total). This is the exact defect
-- docs/adr/0001-model-the-regulators-taxonomy-not-a-simplification.md §4(b)
-- names: a Fellow with two College Fellowships must satisfy each
-- separately, so a per-user-total primary index was always wrong. The ADR
-- already settled the shape ("The index keys on (user_id, body_id); since
-- a College *is* a body, that matches §4(b) per-Fellowship and §4(c)
-- per-College") when 20260813000000 seeded the Colleges — this migration
-- is that settled shape actually landing on practitioner_licences.
--
-- Also adds two columns every future licence needs:
--   track              — which regulatory track this licence sits under
--                         (medical convenience denormalisation, not the
--                         identity key — derivable from parent_body_id,
--                         widens when a non-medical body arrives). Nullable:
--                         not every body is medical.
--   cycle_started_on    — the date THIS licence's compliance cycle began
--                         (M2: the anchor is per-licence admission date,
--                         not a body-wide calendar — two Fellows at the
--                         same College can sit on different cycle
--                         boundaries). Nullable: existing rows have no
--                         known anchor and inventing one would misrepresent
--                         it (same discipline as HKIE's NULL
--                         retention_years in the Task 7 seed).

drop index public.practitioner_licences_one_primary_idx;

create unique index practitioner_licences_one_primary_idx
  on public.practitioner_licences(user_id, body_id) where is_primary;

alter table public.practitioner_licences
  add column track text check (track in ('mchk', 'hkam'));

alter table public.practitioner_licences
  add column cycle_started_on date;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions (repo doctrine: prove the change landed, never
-- read it back from migration text).
-- ---------------------------------------------------------------------------
do $$
declare
  v_indexdef text;
begin
  select indexdef into v_indexdef
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'practitioner_licences'
     and indexname = 'practitioner_licences_one_primary_idx';

  if v_indexdef is null then
    raise exception 'practitioner_licences_one_primary_idx is missing after migration';
  end if;

  if v_indexdef !~ '\(user_id, body_id\)' then
    raise exception 'practitioner_licences_one_primary_idx is not scoped to (user_id, body_id): %', v_indexdef;
  end if;

  -- The old one-total-primary shape indexed (user_id) alone. Same index
  -- name was reused (drop+create), so existence alone wouldn't prove the
  -- replacement actually took — check the column list didn't silently stay
  -- the old shape.
  if v_indexdef ~ '\(user_id\) WHERE' then
    raise exception 'practitioner_licences_one_primary_idx still matches the old one-total-primary shape: %', v_indexdef;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'practitioner_licences' and column_name = 'track'
  ) then
    raise exception 'practitioner_licences.track column is missing after migration';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'practitioner_licences' and column_name = 'cycle_started_on'
  ) then
    raise exception 'practitioner_licences.cycle_started_on column is missing after migration';
  end if;
end $$;

-- Rollback:
--   alter table public.practitioner_licences drop column cycle_started_on;
--   alter table public.practitioner_licences drop column track;
--   drop index public.practitioner_licences_one_primary_idx;
--   create unique index practitioner_licences_one_primary_idx
--     on public.practitioner_licences(user_id) where is_primary;
