-- WP-D — Organisation first-run demographic fields.
-- Plan Phase 6. Extends public.organisers (B2, block-internal change) rather
-- than public.organisations (K1 kernel) — these are organiser-profile
-- fields (professions served, scale, primary contact), not tenancy data.
--
-- No onboarding_completed_at flag column: provisionOrganisation (the only
-- org-creation path today, app/settings/orgActions.ts) never creates an
-- organisers row, so "NOT EXISTS (organisers WHERE organisation_id = ...)"
-- is the first-run signal without a new column.
--
-- One organisers row per organisation: dev-review CRITICAL-adjacent finding
-- — the app originally guarded double-submit with a SELECT-then-INSERT
-- check (no DB constraint), a plain TOCTOU race under concurrent submission.
-- Ladder rung 4 (DB constraint over app code) is also the smaller diff here:
-- one index beats a check-then-insert plus its justifying comment. If a
-- future org model needs one org to hold multiple organiser identities
-- (e.g. distinct legal entities under one tenant), drop this and widen the
-- key deliberately — not by leaving today's race in place "just in case."

alter table public.organisers
  add column if not exists professions_served    text[],
  add column if not exists specialties_served    text[],
  add column if not exists approximate_scale     text
    check (approximate_scale is null or approximate_scale in ('1-10', '11-50', '51-200', '201+')),
  add column if not exists primary_contact_name  text,
  add column if not exists primary_contact_role  text;

create unique index if not exists organisers_one_per_organisation
  on public.organisers (organisation_id);

comment on column public.organisers.professions_served is
  'Codes from public.professions. Captured at organisation first-run. FK arrays are not practical in Postgres — validated at the Zod/server-action layer only, same deliberate posture as professional_profiles.degree_codes (migration 20260916040000).';
comment on column public.organisers.specialties_served is
  'Codes from public.specialties. Captured at organisation first-run. Same FK-array caveat as professions_served above.';
comment on column public.organisers.approximate_scale is
  'Rough event/attendee volume band, captured at organisation first-run.';

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organisers' and column_name = 'approximate_scale'
  ) then
    raise exception 'organisers_onboarding self-check: approximate_scale column missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'organisers' and indexname = 'organisers_one_per_organisation'
  ) then
    raise exception 'organisers_onboarding self-check: one-per-organisation unique index missing';
  end if;
end $$;
