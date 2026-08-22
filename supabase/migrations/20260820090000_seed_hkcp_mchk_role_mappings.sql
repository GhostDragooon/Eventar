-- Minimal role_mappings seed for HKCP and MCHK (2026-08-20).
--
-- Why this exists:
--   award_attendance_credit() only consults category_taxonomy->role_mappings
--   when event_accreditation_groups.category_code IS NOT NULL. The single-body
--   compatibility bridge (set_event_cpd_config) always writes category_code
--   NULL, so demos on that path never hit no_role_match.
--
--   Multi-body groups created outside the bridge (or future C5 UI) set a
--   category_code. Without role_mappings every such registration was
--   skipped:no_role_match. This seed closes that silent gap for the two
--   bodies most demos and the grant care about.
--
-- Scope:
--   Provisional data only — not Task 10.4's full rule packs. Does not touch
--   cycle_config, retention, or award schemes. Safe to overwrite later when
--   sourced packs land.
--
-- Mapping choice:
--   HKCP — attendee/chair/presenter all map to category code 'A' (passive
--   attendance style). A real pack will differentiate active vs passive;
--   for MVP any non-null match unblocks issuance when a group uses 'A'.
--   MCHK — same shape with category code 'passive'.
--
-- Bodies without a row here keep their existing taxonomy (often just a
-- _note placeholder) and continue to skip on role match until seeded.

update public.accrediting_bodies
   set category_taxonomy = coalesce(category_taxonomy, '{}'::jsonb)
     || jsonb_build_object(
          'role_mappings', jsonb_build_object(
            'attendee',  'A',
            'chair',     'A',
            'presenter', 'A'
          ),
          'role_award_rule', 'highest_only',
          '_seed', '20260820090000 provisional — full pack is Task 10.4'
        )
 where short_name = 'HKCP'
   and status = 'active';

update public.accrediting_bodies
   set category_taxonomy = coalesce(category_taxonomy, '{}'::jsonb)
     || jsonb_build_object(
          'role_mappings', jsonb_build_object(
            'attendee',  'passive',
            'chair',     'passive',
            'presenter', 'passive'
          ),
          'role_award_rule', 'highest_only',
          '_seed', '20260820090000 provisional — full pack is Task 10.4'
        )
 where short_name = 'MCHK'
   and status = 'active';

do $$
declare
  v_hkcp jsonb;
  v_mchk jsonb;
begin
  select category_taxonomy into v_hkcp
    from public.accrediting_bodies where short_name = 'HKCP' and status = 'active';
  if v_hkcp is null then
    raise notice 'HKCP not present as active body — role_mappings seed skipped for HKCP';
  elsif v_hkcp #>> '{role_mappings,attendee}' is distinct from 'A' then
    raise exception 'HKCP role_mappings.attendee expected A, got %',
      v_hkcp #>> '{role_mappings,attendee}';
  end if;

  select category_taxonomy into v_mchk
    from public.accrediting_bodies where short_name = 'MCHK' and status = 'active';
  if v_mchk is null then
    raise notice 'MCHK not present as active body — role_mappings seed skipped for MCHK';
  elsif v_mchk #>> '{role_mappings,attendee}' is distinct from 'passive' then
    raise exception 'MCHK role_mappings.attendee expected passive, got %',
      v_mchk #>> '{role_mappings,attendee}';
  end if;

  raise notice 'seed_hkcp_mchk_role_mappings self-check: ok';
end $$;

-- Rollback:
--   update accrediting_bodies
--      set category_taxonomy = category_taxonomy - 'role_mappings' - 'role_award_rule' - '_seed'
--    where short_name in ('HKCP','MCHK');
