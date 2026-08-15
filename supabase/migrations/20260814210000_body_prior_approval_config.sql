-- Task 10.9/10.9 ("S3") — prior-approval deadline advisory, sourced config.
--
-- HKCP requires local FCAA accreditation applications submitted at least
-- one month before the event, and does not accept late/retrospective local
-- applications; overseas meetings are recognised up to two months after.
-- Source: HKAM CME/CPD Guidelines, Cycle 2026-2028.
--
-- This is data only — no new column (cycle_config is already jsonb and
-- not-null; the merge below just adds a key), no new gate on
-- set_event_cpd_config(), no application-tracking field. The advisory is
-- derived and displayed client-side (lib/cpd/priorApproval.ts) from this
-- config; Eventar cannot see an application filed out-of-band by email, so
-- the deadline stays informational and never blocks a save.
--
-- Seed discipline (matching 20260709240000's precedent, e.g. HKIE's NULL
-- retention_years and LSHK's _seed_placeholder marker): a body with no
-- sourced lead time gets no prior_approval key at all — no invented
-- default. HKCP is the only body with a genuinely sourced figure this pass.

update public.accrediting_bodies
   set cycle_config = cycle_config || jsonb_build_object(
     'prior_approval', jsonb_build_object(
       'lead_time_days', 30,
       'accepts_retrospective', false,
       'applies_to', 'local',
       'source', 'HKAM CME/CPD Guidelines, Cycle 2026-2028'
     )
   )
 where short_name = 'HKCP';

-- Self-verifying assertion (repo doctrine: prove the seed landed, never
-- read it back from migration text).
do $$
declare
  v_lead_days integer;
begin
  select (cycle_config -> 'prior_approval' ->> 'lead_time_days')::integer
    into v_lead_days
    from public.accrediting_bodies
   where short_name = 'HKCP';

  if v_lead_days is distinct from 30 then
    raise exception 'expected HKCP prior_approval.lead_time_days = 30, found %', v_lead_days;
  end if;
end $$;

-- Rollback:
--   update public.accrediting_bodies
--      set cycle_config = cycle_config - 'prior_approval'
--    where short_name = 'HKCP';
