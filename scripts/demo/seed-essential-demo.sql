-- Essential Tier Weekend Demo — Seed Data
-- Idempotent: uses ON CONFLICT DO NOTHING throughout.
-- Creates two orgs, three staff each, events with registrations.
-- Run: psql "$DATABASE_URL" -f scripts/demo/seed-essential-demo.sql

begin;

-- ── Organisations ──────────────────────────────────────────────────────────
insert into public.organisations (id, name, slug) values
  ('dd000000-0000-4000-8000-000000000001', 'Acme Medical Society', 'acme-medical')
on conflict (id) do nothing;

insert into public.organisations (id, name, slug) values
  ('dd000000-0000-4000-8000-000000000002', 'Bay Area Nursing Academy', 'bay-nursing')
on conflict (id) do nothing;

-- ── Staff (Acme) ───────────────────────────────────────────────────────────
insert into public.staff (id, email, role, full_name, organisation_id) values
  ('dd100000-0000-4000-8000-000000000001', 'admin@acme.test', 'organiser_admin', 'Alice Admin', 'dd000000-0000-4000-8000-000000000001'),
  ('dd100000-0000-4000-8000-000000000002', 'member1@acme.test', 'organiser_member', 'Bob Member', 'dd000000-0000-4000-8000-000000000001'),
  ('dd100000-0000-4000-8000-000000000003', 'member2@acme.test', 'organiser_member', 'Carol Member', 'dd000000-0000-4000-8000-000000000001')
on conflict (email, organisation_id) do nothing;

-- ── Staff (Bay Area) ───────────────────────────────────────────────────────
insert into public.staff (id, email, role, full_name, organisation_id) values
  ('dd100000-0000-4000-8000-000000000011', 'admin@bay.test', 'organiser_admin', 'Dan Admin', 'dd000000-0000-4000-8000-000000000002'),
  ('dd100000-0000-4000-8000-000000000012', 'nurse1@bay.test', 'organiser_member', 'Eve Nurse', 'dd000000-0000-4000-8000-000000000002'),
  ('dd100000-0000-4000-8000-000000000013', 'nurse2@bay.test', 'organiser_member', 'Fay Nurse', 'dd000000-0000-4000-8000-000000000002')
on conflict (email, organisation_id) do nothing;

-- ── Acme Events (3) ────────────────────────────────────────────────────────
insert into public.events (id, title, start_time, end_time, timezone, venue_name, city, country, latitude, longitude, status, created_by, organisation_id, hosted_by, organized_by, checkin_modes, max_attendees, published_at) values
  ('dd200000-0000-4000-8000-000000000001',
   'Annual Cardiology Update 2026',
   '2026-10-15 09:00:00+08', '2026-10-15 17:00:00+08', 'Asia/Hong_Kong',
   'HK Convention Centre', 'Hong Kong', 'HK', 22.2824, 114.1731,
   'published', 'dd100000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   '[{"name": "Acme Medical Society"}]'::jsonb, '[{"name": "Acme Medical Society"}]'::jsonb,
   '{"staff": true, "self_serve": true}'::jsonb, 100, now()),
  ('dd200000-0000-4000-8000-000000000002',
   'Emergency Medicine Workshop',
   '2026-10-22 14:00:00+08', '2026-10-22 18:00:00+08', 'Asia/Hong_Kong',
   'Queen Mary Hospital', 'Hong Kong', 'HK', 22.2700, 114.1308,
   'published', 'dd100000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   '[{"name": "Acme Medical Society"}]'::jsonb, '[{"name": "Acme Medical Society"}]'::jsonb,
   '{"staff": true, "self_serve": true}'::jsonb, 40, now()),
  ('dd200000-0000-4000-8000-000000000003',
   'Paediatric Nutrition Seminar',
   '2026-11-05 10:00:00+08', '2026-11-05 13:00:00+08', 'Asia/Hong_Kong',
   'Ruttonjee Hospital', 'Hong Kong', 'HK', 22.2760, 114.1750,
   'draft', 'dd100000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000001',
   '[{"name": "Acme Medical Society"}]'::jsonb, '[{"name": "Acme Medical Society"}]'::jsonb,
   '{"staff": true, "self_serve": true}'::jsonb, 30, null)
on conflict (id) do nothing;

-- ── Bay Area Events (2) ────────────────────────────────────────────────────
insert into public.events (id, title, start_time, end_time, timezone, venue_name, city, country, latitude, longitude, status, created_by, organisation_id, hosted_by, organized_by, checkin_modes, max_attendees, published_at) values
  ('dd200000-0000-4000-8000-000000000011',
   'Wound Care Best Practices',
   '2026-10-18 09:00:00+08', '2026-10-18 12:00:00+08', 'Asia/Hong_Kong',
   'Pamela Youde Nethersole Eastern Hospital', 'Hong Kong', 'HK', 22.2712, 114.2361,
   'published', 'dd100000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000002',
   '[{"name":"Bay Area Nursing Academy"}]'::jsonb, '[{"name":"Bay Area Nursing Academy"}]'::jsonb,
   '{"staff": true, "self_serve": true}'::jsonb, 50, now()),
  ('dd200000-0000-4000-8000-000000000012',
   'Geriatric Care Symposium',
   '2026-11-01 13:00:00+08', '2026-11-01 17:00:00+08', 'Asia/Hong_Kong',
   'Tung Wah Hospital', 'Hong Kong', 'HK', 22.2860, 114.1497,
   'published', 'dd100000-0000-4000-8000-000000000012', 'dd000000-0000-4000-8000-000000000002',
   '[{"name":"Bay Area Nursing Academy"}]'::jsonb, '[{"name":"Bay Area Nursing Academy"}]'::jsonb,
   '{"staff": true, "self_serve": true}'::jsonb, 60, now())
on conflict (id) do nothing;

-- ── Registrations (Acme events) ────────────────────────────────────────────
-- 15 for cardiology, 10 for emergency medicine
insert into public.registrations (event_id, email, full_name, registration_code, status) values
  ('dd200000-0000-4000-8000-000000000001', 'dr.wong@example.com', 'Dr. Wong Ka Fai', 'DM0001', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.chan@example.com', 'Dr. Chan Mei Ling', 'DM0002', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.lee@example.com', 'Dr. Lee Siu Man', 'DM0003', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.ng@example.com', 'Dr. Ng Wai Yee', 'DM0004', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.ho@example.com', 'Dr. Ho Chi Keung', 'DM0005', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.cheung@example.com', 'Dr. Cheung Yat Sun', 'DM0006', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.lam@example.com', 'Dr. Lam Wing Yan', 'DM0007', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.tsang@example.com', 'Dr. Tsang Kit Fong', 'DM0008', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.kwok@example.com', 'Dr. Kwok Hoi Lam', 'DM0009', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.tang@example.com', 'Dr. Tang Siu Yin', 'DM0010', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.yip@example.com', 'Dr. Yip Kwong Wah', 'DM0011', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.fung@example.com', 'Dr. Fung Lai Kuen', 'DM0012', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.chow@example.com', 'Dr. Chow Ming Hei', 'DM0013', 'attended'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.siu@example.com', 'Dr. Siu Ka Man', 'DM0014', 'registered'),
  ('dd200000-0000-4000-8000-000000000001', 'dr.poon@example.com', 'Dr. Poon Wai Hung', 'DM0015', 'attended'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.wong@example.com', 'Dr. Wong Ka Fai', 'DM0016', 'registered'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.chan@example.com', 'Dr. Chan Mei Ling', 'DM0017', 'attended'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.lee@example.com', 'Dr. Lee Siu Man', 'DM0018', 'registered'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.ng@example.com', 'Dr. Ng Wai Yee', 'DM0019', 'attended'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.ho@example.com', 'Dr. Ho Chi Keung', 'DM0020', 'registered'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.cheung@example.com', 'Dr. Cheung Yat Sun', 'DM0021', 'attended'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.lam@example.com', 'Dr. Lam Wing Yan', 'DM0022', 'registered'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.tsang@example.com', 'Dr. Tsang Kit Fong', 'DM0023', 'attended'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.kwok@example.com', 'Dr. Kwok Hoi Lam', 'DM0024', 'registered'),
  ('dd200000-0000-4000-8000-000000000002', 'dr.tang@example.com', 'Dr. Tang Siu Yin', 'DM0025', 'attended')
on conflict do nothing;

-- ── Registrations (Bay Area events) ────────────────────────────────────────
-- 12 for wound care, 8 for geriatric
insert into public.registrations (event_id, email, full_name, registration_code, status) values
  ('dd200000-0000-4000-8000-000000000011', 'nurse.liu@example.com', 'Liu Mei Yee', 'DN0001', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.pang@example.com', 'Pang Sui Han', 'DN0002', 'attended'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.ma@example.com', 'Ma Kit Ying', 'DN0003', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.tse@example.com', 'Tse Wai Fong', 'DN0004', 'attended'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.au@example.com', 'Au Wing Ki', 'DN0005', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.so@example.com', 'So Lai Ping', 'DN0006', 'attended'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.ip@example.com', 'Ip Ka Wai', 'DN0007', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.yu@example.com', 'Yu Hoi Yan', 'DN0008', 'attended'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.lok@example.com', 'Lok Man Wah', 'DN0009', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.mak@example.com', 'Mak Yin Ting', 'DN0010', 'attended'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.yeung@example.com', 'Yeung Siu Mei', 'DN0011', 'registered'),
  ('dd200000-0000-4000-8000-000000000011', 'nurse.ko@example.com', 'Ko Wai Man', 'DN0012', 'attended'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.liu@example.com', 'Liu Mei Yee', 'DN0013', 'registered'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.pang@example.com', 'Pang Sui Han', 'DN0014', 'attended'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.ma@example.com', 'Ma Kit Ying', 'DN0015', 'registered'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.tse@example.com', 'Tse Wai Fong', 'DN0016', 'attended'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.au@example.com', 'Au Wing Ki', 'DN0017', 'registered'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.so@example.com', 'So Lai Ping', 'DN0018', 'attended'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.ip@example.com', 'Ip Ka Wai', 'DN0019', 'registered'),
  ('dd200000-0000-4000-8000-000000000012', 'nurse.yu@example.com', 'Yu Hoi Yan', 'DN0020', 'attended')
on conflict do nothing;

commit;

-- Verification queries (not in transaction — read committed)
select 'Organisations' as entity, count(*) as n from organisations where id in ('dd000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002');
select 'Staff' as entity, count(*) as n from staff where organisation_id in ('dd000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002');
select 'Events' as entity, count(*) as n from events where organisation_id in ('dd000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002');
select 'Participants (Acme via RPC)' as entity, count(*) as n from get_org_participants('dd000000-0000-4000-8000-000000000001');
select 'Participants (Bay via RPC)' as entity, count(*) as n from get_org_participants('dd000000-0000-4000-8000-000000000002');
