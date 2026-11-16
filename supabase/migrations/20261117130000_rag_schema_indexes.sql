-- B9 RAG: embedding_indexes, retrieval_index_assignments.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create table public.embedding_indexes (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,
  provider             text not null,
  model                text not null,
  dimension            integer not null check (dimension > 0),
  distance_metric      text not null check (distance_metric in ('cosine')),
  embedding_version    text not null,
  chunk_version        text not null,
  normalisation_policy text not null default 'l2',
  storage_table        text not null unique check (storage_table ~ '^emb_[0-9a-f]{8}$'),
  index_method         text not null default 'none' check (index_method in ('none','hnsw')),
  index_parameters     jsonb not null default '{}'::jsonb,
  status               text not null default 'draft' check (status in
    ('draft','building','evaluating','approved','active','retired','failed')),
  evaluation_run_id    uuid,   -- no FK: evaluation runs are report files in Phase 1
  activated_at         timestamptz,
  retired_at           timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.processing_jobs
  add constraint processing_jobs_embedding_index_fk
  foreign key (embedding_index_id) references public.embedding_indexes(id);

create table public.retrieval_index_assignments (
  id                        uuid primary key default gen_random_uuid(),
  scope_type                text not null check (scope_type in ('global_authority','organisation_private')),
  organisation_id           uuid references public.organisations(id),
  document_family           text not null check (document_family in ('body_rule_source','accreditation_letter')),
  active_embedding_index_id uuid not null references public.embedding_indexes(id),
  effective_from            timestamptz not null default now(),
  effective_to              timestamptz,
  approved_by               uuid,
  created_at                timestamptz not null default now(),
  check ((scope_type = 'global_authority' and organisation_id is null)
      or (scope_type = 'organisation_private' and organisation_id is not null))
);
-- one open assignment per scope + family
create unique index retrieval_index_assignments_open_uidx
  on public.retrieval_index_assignments (scope_type, coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid), document_family)
  where effective_to is null;
