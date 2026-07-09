-- CPD Sprint 3a / Task 4 follow-up — code-quality review found
-- organisers.primary_body_id (nullable FK to accrediting_bodies) has no
-- index, breaking this repo's own FK-indexing convention (every other FK
-- column gets one, including the directly analogous
-- accrediting_bodies.parent_body_id -> accrediting_bodies_parent_idx).
-- Cheap to close now, before Sprint 3b joins/filters on it at volume.

create index organisers_primary_body_idx on public.organisers(primary_body_id);
