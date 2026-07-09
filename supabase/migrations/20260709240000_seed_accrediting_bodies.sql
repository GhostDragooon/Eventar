-- CPD Sprint 3a / Task 7 — seed accrediting_bodies with grounded per-body
-- data. Citations: Credit Ledger §8.5 / Data Model "Per-body cycle
-- configs..." / Decisions Log Q24. status='active' only for the
-- first-targeted, citation-grounded bodies; LSHK stays 'onboarding'
-- (retention 2yr confirmed, but cycle/category NOT verified this pass),
-- and HKAM stays 'deferred' (parent body only — its 15 Colleges incl.
-- HKCR are separate deferred child rows, not seeded individually this
-- pass, per Out of Scope.md HKAM-partnership timing, Year 2+).
--
-- HKIE.retention_years is NULL deliberately (Ivan's decision, Task 7):
-- HKIE's own Corporate Member guidance states NO retention figure (a
-- verified absence, Q24) — a silent default of 6 would look sourced when
-- it isn't. accrediting_bodies.retention_years was made nullable in
-- 20260709160000 specifically to allow this.
--
-- Do NOT fabricate VSB's or LSHK's category taxonomy, or LSHK's cycle —
-- those weren't verified this session; they carry explicit placeholder
-- markers instead of invented values.

insert into public.accrediting_bodies
  (organisation_id, short_name, full_name, jurisdiction, cycle_config, category_taxonomy, retention_years, status)
values
  ('00000000-0000-0000-0000-000000000001', 'IA', 'Insurance Authority', 'HK',
   '{"cycle_length_years":1,"cycle_start_month":8,"cycle_start_day":1,"annual_floor":15,"core_floor_hours":3,"units":"hours","cycle_start_source":"fixed","report_by_month":9,"report_by_day":30}',
   '{"types":["Type 1","Type 2","Type 3","Type 4","Type 5","Type 6","Type 7","Type 8"],"source":"GL24 Annex 1 — 8 Types of Qualified CPD Activities"}',
   3, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'HKICPA', 'Hong Kong Institute of Certified Public Accountants', 'HK',
   '{"cycle_length_years":3,"cycle_choice":"rolling","annual_floor":20,"verifiable_floor_hours":60,"period_floor_hours":120,"units":"hours"}',
   '{"note":"not itemised this pass — Statement 1.500 covers cycle/hours/retention only, no category breakdown fetched"}',
   5, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'MPFA', 'Mandatory Provident Fund Schemes Authority', 'HK',
   '{"cycle_length_years":1,"cycle_start_month":1,"cycle_start_day":1,"annual_floor":15,"core_floor_hours":4,"cycle_choice":null,"pro_rata_first_cycle":true,"carry_forward_allowed":false,"units":"hours","cycle_start_source":"fixed"}',
   '{"core":["regulatory compliance","MPF system","ethics"],"non_core":["basic accounting theories","communication skills","computer knowledge","economic/financial analysis","ESG","financial planning","financial products","fintech","insurance","investment","law and legal knowledge","management/supervisory skills","risk management"]}',
   3, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'HKIE', 'The Hong Kong Institution of Engineers', 'HK',
   '{"cycle_length_years":1,"annual_floor":30,"category_floors":{"DSTM":5,"BAS_GPM":5,"H_S":3},"self_learning_cap_hours":10,"social_cap_hours":3,"units":"hours","audit_sample_pct":1}',
   '{"categories":["DSTM","BAS_GPM","H_S","Others"],"source":"Guidance Notes for MCPD for Corporate Members, May 2026"}',
   null, 'active'), -- retention_years NULL: no stated figure (Q24), not defaulted to 6

  ('00000000-0000-0000-0000-000000000001', 'VSB', 'Veterinary Surgeons Board of Hong Kong', 'HK',
   '{"cycle_length_years":2,"cycle_choice":"rolling","cycle_start_month":10,"cycle_start_day":1,"cycle_floor_points":40,"structured_floor_points":25,"units":"points","audit_sample_pct":3}',
   '{"note":"not itemised this pass — VSB FAQ covers cycle/points/retention only, no category breakdown fetched"}',
   6, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'PT_BOARD', 'Physiotherapists Board (AHP Council)', 'HK',
   '{"cycle_length_years":3,"cycle_start_month":7,"cycle_start_day":1,"cycle_floor_points":45,"annual_floor_points":5,"core_floor_points":23,"units":"points"}',
   '{"main_categories":[{"code":"I","name":"Attendance at lecture/seminar/conference"},{"code":"II","name":"Post-graduate studies"},{"code":"III","name":"In-service training"},{"code":"IV","name":"Self study"},{"code":"V","name":"Active participation"},{"code":"VI","name":"Publication"}],"sub_categories":[{"code":"C","name":"Core","weight":1.0},{"code":"N","name":"Non-core","weight":0.5}]}',
   6, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'LSHK', 'The Law Society of Hong Kong', 'HK',
   '{"_seed_placeholder": true, "_todo": "cycle not verified this session — only retention (2yr) was confirmed, per Credit Ledger §8.5"}',
   '{"_seed_placeholder": true, "_todo": "category taxonomy not verified this session"}',
   2, 'onboarding'), -- onboarding, not active, until cycle/category are grounded

  ('00000000-0000-0000-0000-000000000001', 'HKAM', 'Hong Kong Academy of Medicine', 'HK',
   '{"_note": "parent body only — 15 Colleges (incl. HKCR) are separate deferred child rows, not seeded individually this pass, per Out of Scope.md HKAM-partnership timing (Year 2+)"}',
   '{"_note": "not applicable at the parent level — each College sets its own taxonomy on partnership"}',
   6, 'deferred');
