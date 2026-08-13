-- 2026 dual-track plan, Task 1 (docs/plans/2026-08-10-dual-track-stage-scope.md,
-- ~/.claude/plans/target-product-for-2026-proud-castle.md). Seeds MCHK as a
-- top-level body and the 15 HKAM Colleges as its children, flips HKAM to
-- 'active', and authorises the default org for every currently-launchable
-- body — closing the empty organisation_body_authorisations gate that
-- currently makes set_event_cpd_config() refuse every event.
--
-- College full_name list: sourced from HKAM's own site,
-- https://www.hkam.org.hk/en/academy-colleges (fetched 2026-08-13), not
-- model recall — regulatory data, per repo doctrine on unsourced facts.
-- cycle_config/category_taxonomy are placeholders, same shape as HKAM's
-- pre-existing row: real per-body rule packs are Task 4, not this one.
--
-- MCHK full_name is the statutory registration body under the Medical
-- Registration Ordinance (Cap. 161) — unambiguous, no College-list-style
-- sourcing risk (a single well-known statutory name, not an enumerable list).
--
-- Authorisation scope (confirmed, not the plan's default): default org x
-- {IA, HKICPA, MPFA, HKIE, VSB, PT_BOARD, MCHK, all 15 Colleges}. LSHK
-- excluded — status='onboarding', its cycle/category was never grounded
-- (20260709240000's own comment).

insert into public.accrediting_bodies
  (organisation_id, short_name, full_name, parent_body_id, jurisdiction,
   cycle_config, category_taxonomy, retention_years, status)
values
  ('00000000-0000-0000-0000-000000000001', 'MCHK', 'Medical Council of Hong Kong', null, 'HK',
   '{"_note": "provisional — MCHK-track rule pack lands in Task 4"}',
   '{"_note": "provisional — MCHK-track rule pack lands in Task 4"}',
   null, 'active');

insert into public.accrediting_bodies
  (organisation_id, short_name, full_name, parent_body_id, jurisdiction,
   cycle_config, category_taxonomy, retention_years, status)
select
  '00000000-0000-0000-0000-000000000001', v.short_name, v.full_name, hkam.id, 'HK',
  '{"_note": "provisional — per-College rule pack lands in Task 4 (docs/adr/0001)"}',
  '{"_note": "provisional — per-College rule pack lands in Task 4 (docs/adr/0001)"}',
  null, 'active'
from (values
  ('HKCA',    'The Hong Kong College of Anaesthesiologists'),
  ('HKCCM',   'Hong Kong College of Community Medicine'),
  ('CDSHK',   'The College of Dental Surgeons of Hong Kong'),
  ('HKCEM',   'Hong Kong College of Emergency Medicine'),
  ('HKCFP',   'The Hong Kong College of Family Physicians'),
  ('HKCOG',   'The Hong Kong College of Obstetricians and Gynaecologists'),
  ('COHK',    'The College of Ophthalmologists of Hong Kong'),
  ('HKCOS',   'The Hong Kong College of Orthopaedic Surgeons'),
  ('HKCORL',  'The Hong Kong College of Otorhinolaryngologists'),
  ('HKCPaed', 'Hong Kong College of Paediatricians'),
  ('HKCPath', 'The Hong Kong College of Pathologists'),
  ('HKCP',    'Hong Kong College of Physicians'),
  ('HKCPsych','The Hong Kong College of Psychiatrists'),
  ('HKCR',    'Hong Kong College of Radiologists'),
  ('CSHK',    'The College of Surgeons of Hong Kong')
) as v(short_name, full_name)
cross join (select id from public.accrediting_bodies where short_name = 'HKAM') as hkam;

update public.accrediting_bodies
   set status = 'active', onboarded_at = now()
 where short_name = 'HKAM' and status <> 'active';

-- ---------------------------------------------------------------------------
-- Authorise the default org. LSHK deliberately excluded (see header).
-- ---------------------------------------------------------------------------
insert into public.organisation_body_authorisations (organisation_id, body_id)
select '00000000-0000-0000-0000-000000000001', ab.id
  from public.accrediting_bodies ab
 where ab.short_name in (
   'IA','HKICPA','MPFA','HKIE','VSB','PT_BOARD','MCHK',
   'HKCA','HKCCM','CDSHK','HKCEM','HKCFP','HKCOG','COHK','HKCOS',
   'HKCORL','HKCPaed','HKCPath','HKCP','HKCPsych','HKCR','CSHK'
 )
on conflict (organisation_id, body_id) do nothing;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions (repo doctrine: prove the seed landed, never
-- read it back from migration text).
-- ---------------------------------------------------------------------------
do $$
declare
  v_college_count integer;
  v_auth_count integer;
  v_hkam_status text;
begin
  select count(*) into v_college_count
    from public.accrediting_bodies
   where parent_body_id = (select id from public.accrediting_bodies where short_name = 'HKAM');
  if v_college_count <> 15 then
    raise exception 'expected 15 HKAM Colleges seeded, found %', v_college_count;
  end if;

  select status into v_hkam_status from public.accrediting_bodies where short_name = 'HKAM';
  if v_hkam_status <> 'active' then
    raise exception 'HKAM did not flip to active, is %', v_hkam_status;
  end if;

  select count(*) into v_auth_count
    from public.organisation_body_authorisations a
    join public.accrediting_bodies ab on ab.id = a.body_id
   where a.organisation_id = '00000000-0000-0000-0000-000000000001'
     and ab.status = 'active'
     and ab.short_name in (
       'IA','HKICPA','MPFA','HKIE','VSB','PT_BOARD','MCHK',
       'HKCA','HKCCM','CDSHK','HKCEM','HKCFP','HKCOG','COHK','HKCOS',
       'HKCORL','HKCPaed','HKCPath','HKCP','HKCPsych','HKCR','CSHK'
     );
  if v_auth_count <> 22 then
    raise exception 'expected 22 organisation_body_authorisations rows against active bodies, found %', v_auth_count;
  end if;

  if exists (
    select 1 from public.organisation_body_authorisations a
    join public.accrediting_bodies ab on ab.id = a.body_id
   where a.organisation_id = '00000000-0000-0000-0000-000000000001'
     and ab.short_name = 'LSHK'
  ) then
    raise exception 'LSHK was authorised — it should stay excluded (status=onboarding, ungrounded data)';
  end if;
end $$;

-- Rollback (this migration authorised 22 bodies for the default org, not just
-- the 16 new rows — IA/HKICPA/MPFA/HKIE/VSB/PT_BOARD's authorisations were
-- also first created here, since the table was 0 rows everywhere beforehand):
--   delete from organisation_body_authorisations where organisation_id =
--     '00000000-0000-0000-0000-000000000001' and body_id in (select id from
--     accrediting_bodies where short_name in (
--       'IA','HKICPA','MPFA','HKIE','VSB','PT_BOARD','MCHK',
--       'HKCA','HKCCM','CDSHK','HKCEM','HKCFP','HKCOG','COHK','HKCOS',
--       'HKCORL','HKCPaed','HKCPath','HKCP','HKCPsych','HKCR','CSHK'
--     ));
--   delete from accrediting_bodies where parent_body_id = (select id from
--     accrediting_bodies where short_name = 'HKAM') or short_name = 'MCHK';
--   update accrediting_bodies set status = 'deferred', onboarded_at = null
--     where short_name = 'HKAM';
