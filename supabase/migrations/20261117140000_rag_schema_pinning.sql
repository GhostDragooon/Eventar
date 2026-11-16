-- B9 RAG: pack_versions, pack_sources, pack_source_passages.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create table public.pack_versions (
  id               uuid primary key default gen_random_uuid(),
  rule_pack_id     uuid not null,   -- no FK: rule packs are versioned code, there is no table
  version          text not null,
  review_status    text not null default 'pending' check (review_status in
    ('not_required','pending','in_review','changes_required','approved','rejected')),
  lifecycle_status text not null default 'draft' check (lifecycle_status in
    ('draft','active','superseded','withdrawn','archived')),
  approved_by      uuid,
  approved_at      timestamptz,
  effective_from   date,
  effective_to     date,
  pack_hash        bytea,
  created_at       timestamptz not null default now(),
  unique (rule_pack_id, version)
);

create table public.pack_sources (
  id                  uuid primary key default gen_random_uuid(),
  pack_version_id     uuid not null references public.pack_versions(id),
  document_version_id uuid not null references public.document_versions(id),
  chunk_version       text not null,
  inclusion_basis     text not null,
  included_by         uuid,
  included_at         timestamptz not null default now(),
  unique (pack_version_id, document_version_id)
);

create table public.pack_source_passages (
  id                      uuid primary key default gen_random_uuid(),
  pack_source_id          uuid not null references public.pack_sources(id),
  chunk_id                uuid not null references public.chunks(id),
  source_location         jsonb not null,
  content_sha256          bytea not null check (octet_length(content_sha256) = 32),
  retrieval_query_id      uuid,   -- FK added in the evaluation file
  inclusion_review_status text not null default 'pending' check (inclusion_review_status in
    ('not_required','pending','in_review','changes_required','approved','rejected')),
  inclusion_basis         text not null,
  included_by             uuid,
  included_at             timestamptz not null default now(),
  unique (pack_source_id, chunk_id)
);
