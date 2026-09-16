-- WP-C — Controlled lists for professional identity.
-- Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 1
--
-- Five global reference tables (profession, specialty, position, degree,
-- society). No organisation_id — these are reference data shared across
-- every tenant (same status as a country-code table), not per-tenant domain
-- data. text PK (the code itself) matches how professional_profiles already
-- stores these values (profession_code, position_code, specialty_code) — no
-- uuid indirection needed for a value that is already the natural key.
--
-- New-policy convention: (select auth.uid()) instead of bare auth.uid() —
-- these five tables have no auth.uid()-scoped policy (public read only), so
-- the note is for the two self-CRUD domain tables later in this plan.

create table public.professions (
  code           text primary key,
  label_en       text not null,
  label_zh_hant  text,
  display_order  int not null default 0,
  is_active      boolean not null default true
);

create table public.positions (
  code           text primary key,
  label_en       text not null,
  label_zh_hant  text,
  display_order  int not null default 0,
  is_active      boolean not null default true
);

create table public.degrees (
  code           text primary key,
  label_en       text not null,
  label_zh_hant  text,
  display_order  int not null default 0,
  is_active      boolean not null default true
);

create table public.specialties (
  code            text primary key,
  profession_code text references public.professions(code),
  label_en        text not null,
  label_zh_hant   text,
  display_order   int not null default 0,
  is_active       boolean not null default true
);

create index specialties_profession_idx on public.specialties(profession_code);

create table public.societies (
  code           text primary key,
  jurisdiction   text not null default 'HK',
  label_en       text not null,
  label_zh_hant  text,
  display_order  int not null default 0,
  is_active      boolean not null default true
);

-- ---------------------------------------------------------------------------
-- RLS — public read of active rows, no client write. Staff/admin write is
-- service-role only until an admin UI exists (none planned this slice).
-- ---------------------------------------------------------------------------
alter table public.professions enable row level security;
alter table public.positions   enable row level security;
alter table public.degrees     enable row level security;
alter table public.specialties enable row level security;
alter table public.societies   enable row level security;

create policy "professions_public_read" on public.professions
  for select to anon, authenticated using (is_active);
create policy "positions_public_read" on public.positions
  for select to anon, authenticated using (is_active);
create policy "degrees_public_read" on public.degrees
  for select to anon, authenticated using (is_active);
create policy "specialties_public_read" on public.specialties
  for select to anon, authenticated using (is_active);
create policy "societies_public_read" on public.societies
  for select to anon, authenticated using (is_active);

revoke all on public.professions from public, anon, authenticated;
revoke all on public.positions   from public, anon, authenticated;
revoke all on public.degrees     from public, anon, authenticated;
revoke all on public.specialties from public, anon, authenticated;
revoke all on public.societies   from public, anon, authenticated;

grant select on public.professions to anon, authenticated;
grant select on public.positions   to anon, authenticated;
grant select on public.degrees     to anon, authenticated;
grant select on public.specialties to anon, authenticated;
grant select on public.societies   to anon, authenticated;

grant all on public.professions to service_role;
grant all on public.positions   to service_role;
grant all on public.degrees     to service_role;
grant all on public.specialties to service_role;
grant all on public.societies   to service_role;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
insert into public.professions (code, label_en, display_order) values
  ('medicine',              'Medicine',                1),
  ('nursing',                'Nursing',                 2),
  ('dentistry',              'Dentistry',               3),
  ('pharmacy',                'Pharmacy',                4),
  ('physiotherapy',          'Physiotherapy',           5),
  ('chinese_medicine',       'Chinese Medicine',        6),
  ('optometry',               'Optometry',               7),
  ('chiropractic',           'Chiropractic',            8),
  ('occupational_therapy',   'Occupational Therapy',    9),
  ('speech_therapy',         'Speech Therapy',         10),
  ('radiography',            'Radiography',            11),
  ('medical_laboratory',     'Medical Laboratory Science', 12),
  ('other',                  'Other',                  99);

insert into public.positions (code, label_en, display_order) values
  ('consultant',              'Consultant',                1),
  ('associate_consultant',    'Associate Consultant',     2),
  ('senior_medical_officer',  'Senior Medical Officer',   3),
  ('medical_officer',         'Medical Officer',          4),
  ('resident',                'Resident',                 5),
  ('clinical_professor',      'Clinical Professor',       6),
  ('associate_professor',     'Associate Professor',      7),
  ('assistant_professor',     'Assistant Professor',      8),
  ('lecturer',                'Lecturer',                  9),
  ('research_fellow',         'Research Fellow',         10),
  ('private_practitioner',    'Private Practitioner',     11),
  ('other',                   'Other',                    99);

insert into public.degrees (code, label_en, display_order) values
  ('MBBS',   'MBBS',   1),
  ('MBChB',  'MBChB',  2),
  ('MD',     'MD',     3),
  ('MRCP',   'MRCP',   4),
  ('FHKCP',  'FHKCP',  5),
  ('FHKAM',  'FHKAM',  6),
  ('FESC',   'FESC',   7),
  ('FACC',   'FACC',   8),
  ('FRCP',   'FRCP',   9),
  ('PhD',    'PhD',   10),
  ('other',  'Other', 99);

-- Cardiac/cardiovascular first per the locked product decision (§5 of the
-- write-up: "specialty-agnostic from day one... cardiac / cardiovascular is
-- the first populated set"). A general_medicine + other sentinel keeps the
-- picker usable for the first non-cardiology practitioner who signs up.
insert into public.specialties (code, profession_code, label_en, display_order) values
  ('cardiac_cardiovascular', 'medicine', 'Cardiology / Cardiovascular Medicine', 1),
  ('general_medicine',       'medicine', 'General Medicine',                     2),
  ('other',                  'medicine', 'Other',                                99);

insert into public.societies (code, jurisdiction, label_en, display_order) values
  ('HKCS', 'HK', 'Hong Kong College of Cardiology', 1),
  ('HKMA', 'HK', 'Hong Kong Medical Association',   2),
  ('other', 'HK', 'Other', 99);

-- ---------------------------------------------------------------------------
-- Self-check
--
-- NOTE for local dev: supabase/seed.sql's documented blanket grant (2026-07-15
-- CLI-2.109 workaround) re-grants anon/authenticated table-level DML on ALL
-- public tables, including these, AFTER this migration applies — so this
-- privilege check is the migration's own posture (true always in production,
-- which never runs seed.sql; true here only until seed.sql runs on a local
-- `db reset`). It is not re-narrowed in seed.sql because, like
-- professional_profiles' INSERT/UPDATE, RLS alone already denies the write —
-- verified empirically: POST as anon returns 42501, "new row violates
-- row-level security policy" (Hard Rule 11's own required proof), not just
-- "some error." Only tables whose write path must NEVER go direct even via
-- service_role (organisation_body_authorisations, practitioner_licences, …)
-- get re-narrowed in seed.sql; these lookup tables have no such invariant —
-- service_role writing them directly (future admin UI) is the intended path.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.professions', 'INSERT')
     or has_table_privilege('anon', 'public.professions', 'UPDATE')
     or has_table_privilege('anon', 'public.professions', 'DELETE') then
    raise exception 'controlled_lists self-check: anon must not be able to write professions';
  end if;
  if not has_table_privilege('anon', 'public.professions', 'SELECT') then
    raise exception 'controlled_lists self-check: anon lost SELECT on professions';
  end if;
  if (select count(*) from public.professions) = 0 then
    raise exception 'controlled_lists self-check: professions seed is empty';
  end if;
  if (select count(*) from public.specialties where code = 'cardiac_cardiovascular') = 0 then
    raise exception 'controlled_lists self-check: cardiac_cardiovascular specialty missing';
  end if;
end $$;
