-- B9 RAG: documents, document_versions, document_relationships, document_approvals.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create table public.documents (
  id                    uuid primary key default gen_random_uuid(),
  scope_type            text not null check (scope_type in ('global_authority','organisation_private')),
  owner_organisation_id uuid references public.organisations(id),
  body_id               uuid references public.accrediting_bodies(id),
  family                text not null check (family in ('body_rule_source','accreditation_letter')),
  source_filename       text not null,
  source_mime           text not null,
  source_sha256         bytea not null check (octet_length(source_sha256) = 32),
  storage_path          text not null unique,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint documents_scope_owner_check check (
    (scope_type = 'global_authority' and owner_organisation_id is null)
    or (scope_type = 'organisation_private' and owner_organisation_id is not null))
);
create unique index documents_global_sha_uidx on public.documents (family, source_sha256)
  where scope_type = 'global_authority';
create unique index documents_private_sha_uidx on public.documents (owner_organisation_id, family, source_sha256)
  where scope_type = 'organisation_private';
create index documents_body_id_idx on public.documents (body_id);
create trigger documents_touch_updated_at before update on public.documents
  for each row execute function public.touch_updated_at();

create table public.document_versions (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.documents(id),
  declared_version      text not null,
  revision_label        text,
  source_published_at   date,
  effective_from        date,
  effective_to          date,
  parser_policy_version text not null,
  processing_status     text not null default 'uploaded' check (processing_status in
    ('uploaded','queued','parsing','parsed','chunking','chunked','embedding','indexed','processing_failed','qc_failed','cancelled')),
  review_status         text not null default 'pending' check (review_status in
    ('not_required','pending','in_review','changes_required','approved','rejected')),
  lifecycle_status      text not null default 'draft' check (lifecycle_status in
    ('draft','active','superseded','withdrawn','archived')),
  ocr_status            text not null default 'not_required' check (ocr_status in
    ('not_required','suspected','required','completed','failed')),
  active_parse_run_id   uuid,   -- FK added in the processing file (parse_runs is created there)
  active_chunk_set_id   uuid,   -- no FK: a chunk set is a value shared by chunks rows, not a table
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create index document_versions_document_id_idx on public.document_versions (document_id);
create trigger document_versions_touch_updated_at before update on public.document_versions
  for each row execute function public.touch_updated_at();

create table public.document_relationships (
  id                          uuid primary key default gen_random_uuid(),
  source_document_version_id  uuid not null references public.document_versions(id),
  target_document_version_id  uuid not null references public.document_versions(id),
  relationship_type           text not null check (relationship_type in ('supersedes')),
  effective_from              date,
  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  check (source_document_version_id <> target_document_version_id),
  unique (source_document_version_id, target_document_version_id, relationship_type)
);

create table public.document_approvals (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id),
  approval_status     text not null check (approval_status in ('approved','rejected','withdrawn')),
  approved_by         uuid,
  approved_at         timestamptz,
  approval_basis      text not null,
  review_notes        text,
  withdrawn_by        uuid,
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index document_approvals_version_idx on public.document_approvals (document_version_id);
