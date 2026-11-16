-- B9 RAG: processing_jobs, parse_runs, parsed_elements, chunks.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create table public.processing_jobs (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid references public.organisations(id),
  document_version_id   uuid not null references public.document_versions(id),
  idempotency_key       text not null unique,
  job_type              text not null check (job_type in ('ingest','reindex')),
  processing_status     text not null default 'queued' check (processing_status in
    ('uploaded','queued','parsing','parsed','chunking','chunked','embedding','indexed','processing_failed','qc_failed','cancelled')),
  current_stage         text check (current_stage in ('detect','parse','parser_qc','chunk','chunk_qc','embed','index')),
  attempt_count         integer not null default 0,
  maximum_attempts      integer not null default 3,
  next_attempt_at       timestamptz not null default now(),
  error_code            text,
  error_detail_redacted text,
  worker_version        text,
  parser_policy_version text,
  chunk_version         text,
  embedding_index_id    uuid,   -- FK added in the indexes file
  requested_by          uuid,
  claimed_by            text,
  claimed_at            timestamptz,
  lease_expires_at      timestamptz,
  cancel_requested_at   timestamptz,
  started_at            timestamptz,
  heartbeat_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now()
);
create index processing_jobs_version_idx on public.processing_jobs (document_version_id);
create index processing_jobs_due_idx on public.processing_jobs (next_attempt_at) where processing_status = 'queued';

create table public.parse_runs (
  id                    uuid primary key default gen_random_uuid(),
  document_version_id   uuid not null references public.document_versions(id),
  processing_job_id     uuid references public.processing_jobs(id),
  parser_name           text not null,
  parser_version        text not null,
  parser_policy_version text not null,
  status                text not null default 'candidate' check (status in
    ('candidate','qc_passed','approved','rejected','superseded')),
  warnings              jsonb not null default '[]'::jsonb,
  quality_results       jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  approved_by           uuid,
  approved_at           timestamptz
);
create unique index parse_runs_one_approved_uidx on public.parse_runs (document_version_id) where status = 'approved';
create index parse_runs_version_idx on public.parse_runs (document_version_id);

alter table public.document_versions
  add constraint document_versions_active_parse_run_fk
  foreign key (active_parse_run_id) references public.parse_runs(id);

create table public.parsed_elements (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id),
  parse_run_id        uuid not null references public.parse_runs(id),
  ordinal             integer not null,
  element_type        text not null check (element_type in
    ('heading','paragraph','list_item','table','footnote','header','footer','text_box','field','comment')),
  section_path        text[] not null default '{}',
  page_start          integer,
  page_end            integer,
  location            jsonb not null default '{}'::jsonb,
  text                text not null,
  structured_content  jsonb,
  content_sha256      bytea not null check (octet_length(content_sha256) = 32),
  parser_name         text not null,
  parser_version      text not null,
  created_at          timestamptz not null default now(),
  unique (parse_run_id, ordinal)
);
create index parsed_elements_version_idx on public.parsed_elements (document_version_id);

create table public.chunks (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id),
  parse_run_id        uuid not null references public.parse_runs(id),
  chunk_set_id        uuid not null,
  chunk_version       text not null,
  parent_chunk_id     uuid references public.chunks(id),
  ordinal             integer not null,
  section_path        text[] not null default '{}',
  page_start          integer,
  page_end            integer,
  location            jsonb not null default '{}'::jsonb,
  text                text not null,
  text_for_embedding  text not null,
  content_sha256      bytea not null check (octet_length(content_sha256) = 32),
  character_start     integer,
  character_end       integer,
  token_count         integer not null,
  language            text,
  content_type        text not null default 'text' check (content_type in ('text','table','list')),
  parse_element_ids   uuid[] not null default '{}',
  is_table            boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (chunk_set_id, ordinal)
);
create index chunks_version_idx on public.chunks (document_version_id);
create index chunks_parent_idx on public.chunks (parent_chunk_id);
