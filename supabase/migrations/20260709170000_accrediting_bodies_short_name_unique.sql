-- CPD Sprint 3a / Task 3 follow-up — code-quality review found no
-- uniqueness constraint on accrediting_bodies.short_name, the de facto
-- natural key driving Task 7's seed data and the practitioner-facing
-- "declare your licence" picker. Cheap to close now, before Task 7 seeds
-- real rows; retrofitting after data exists would need a cleanup pass
-- first. Mirrors staff_email_org_key's org-scoped uniqueness shape.

alter table public.accrediting_bodies
  add constraint accrediting_bodies_org_short_name_key
  unique (organisation_id, short_name);
