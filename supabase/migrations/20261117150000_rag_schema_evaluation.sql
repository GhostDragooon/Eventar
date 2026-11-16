-- B9 RAG: evaluation_cases, retrieval_traces.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create table public.evaluation_cases (
  id                          uuid primary key default gen_random_uuid(),
  case_id                     text not null,
  question                    text not null,
  use_case                    text not null check (use_case in
    ('rule_lookup','source_location','version_comparison','pack_authoring_support')),
  expected_query_class        text not null check (expected_query_class in
    ('exact_value','requirement','checklist','comparison','superseded')),
  expected_source_version_ids uuid[] not null default '{}',
  expected_passages           jsonb not null default '[]'::jsonb,
  acceptable_answer           text,
  prohibited_claims           text[] not null default '{}',
  answerability               text not null check (answerability in ('answerable','unanswerable')),
  organisation_scope          uuid references public.organisations(id),
  dataset_partition           text not null check (dataset_partition in
    ('development','frozen_validation','security','regression')),
  dataset_version             text not null,
  reviewer                    text,
  review_status               text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at                  timestamptz not null default now(),
  unique (dataset_version, case_id)
);

create table public.retrieval_traces (
  query_id                    uuid primary key default gen_random_uuid(),
  original_query              text,
  redacted_query              text not null,
  caller_id                   uuid,
  resolved_organisation_scope uuid references public.organisations(id),
  use_case                    text not null check (use_case in
    ('rule_lookup','source_location','version_comparison','pack_authoring_support')),
  resolved_query_class        text check (resolved_query_class in
    ('exact_value','requirement','checklist','comparison','superseded')),
  classification_source       text check (classification_source in ('default','rule')),
  candidate_chunk_ids         uuid[] not null default '{}',
  lexical_ranks               jsonb not null default '{}'::jsonb,
  vector_ranks                jsonb not null default '{}'::jsonb,
  fused_ranks                 jsonb not null default '{}'::jsonb,
  rerank_scores               jsonb not null default '{}'::jsonb,
  gate_status                 text not null check (gate_status in ('pass','fail')),
  gate_reasons                text[] not null default '{}',
  pipeline_versions           jsonb not null default '{}'::jsonb,
  latency_by_stage            jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);

alter table public.pack_source_passages
  add constraint pack_source_passages_retrieval_query_fk
  foreign key (retrieval_query_id) references public.retrieval_traces(query_id);
