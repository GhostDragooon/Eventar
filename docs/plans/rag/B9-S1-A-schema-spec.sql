-- B9-S1-A schema spec. AUTHORITATIVE DDL for card B9-S1-A
-- (docs/plans/2026-08-29-rag-execution-plan.md, "Revision R2", R2.4).
--
-- This file is a SPEC, not a migration. The executing agent copies each
-- "-- FILE:" section, unchanged, into the migration file it names. The agent
-- does not add, drop, rename or retype a column, constraint, policy or
-- function. If something here cannot be applied, the agent stops (BLOCKED).
--
-- Checked 2026-11-16: the whole file applies on the local stack inside a
-- transaction that was rolled back (Postgres 17.6, pgvector 0.8.2).
--
-- Conventions fixed here:
--   * 15 tables, all in schema public, guideline names.
--   * Enumerated values are text + CHECK (repo convention), never enum types.
--   * Actor columns (created_by, approved_by, requested_by, ...) hold the
--     auth user id (the JWT "sub"), plain uuid, no foreign key. NULL = system.
--   * Hashes are bytea. Foreign keys are ON DELETE RESTRICT (the default).
--   * Functions: security definer, search_path 'public','pg_temp' (repo
--     convention, as app_private.auth_email()).

-- FILE: 20261117100000_rag_init_extensions.sql ------------------------------
create extension if not exists vector with schema extensions;

-- FILE: 20261117110000_rag_schema_core.sql ----------------------------------
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

-- FILE: 20261117120000_rag_schema_processing.sql ----------------------------
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

-- FILE: 20261117130000_rag_schema_indexes.sql -------------------------------
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

-- FILE: 20261117140000_rag_schema_pinning.sql -------------------------------
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

-- FILE: 20261117150000_rag_schema_evaluation.sql ----------------------------
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

-- FILE: 20261117160000_rag_grants_rls.sql -----------------------------------
-- 1. Read helpers. Definer, so the joins inside are not themselves filtered.
--    body_admin is matched on the confirmed email (app_private.auth_email()),
--    not on current_staff_id(), so a person with staff rows in two
--    organisations is still matched for the right one.
--    A document with body_id NULL is readable by eventar_staff only (intended).
--    An organisation_private document is readable by eventar_staff only, even when
--    it names a body: deny by default until Ivan rules on accreditation letters.
create function public.rag_can_read_document(p_document_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select app_private.is_eventar_staff()
      or exists (
        select 1
          from public.documents d
          join public.accrediting_bodies b on b.id = d.body_id
          join public.staff s on s.organisation_id = b.organisation_id
         where d.id = p_document_id
           and d.scope_type = 'global_authority'   -- an organisation-private document is never readable by a body_admin
           and s.email = app_private.auth_email()
           and s.role = 'body_admin'
           and s.status = 'active');
$$;

create function public.rag_can_read_version(p_document_version_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(
    (select public.rag_can_read_document(v.document_id)
       from public.document_versions v where v.id = p_document_version_id),
    false);
$$;

revoke all on function public.rag_can_read_document(uuid) from public, anon;
revoke all on function public.rag_can_read_version(uuid)  from public, anon;
grant execute on function public.rag_can_read_document(uuid) to authenticated, service_role;
grant execute on function public.rag_can_read_version(uuid)  to authenticated, service_role;

-- 2. Grants. No API role writes anything directly, except service_role on the
--    eight non-audited tables. No API role holds TRUNCATE, TRIGGER or REFERENCES (Q44).
do $$
declare
  t text;
  all_tables text[] := array[
    'documents','document_versions','document_relationships','document_approvals',
    'processing_jobs','parse_runs','parsed_elements','chunks',
    'embedding_indexes','retrieval_index_assignments',
    'pack_versions','pack_sources','pack_source_passages',
    'evaluation_cases','retrieval_traces'];
  audited text[] := array[
    'processing_jobs','document_approvals','embedding_indexes','retrieval_index_assignments',
    'pack_versions','pack_sources','pack_source_passages'];
begin
  foreach t in array all_tables loop
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated, service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array all_tables loop
    if not (t = any (audited)) then
      execute format('grant insert, update, delete on table public.%I to service_role', t);
    end if;
  end loop;
end $$;

-- 3. RLS: one SELECT policy per table, for authenticated only. No write policy.
create policy documents_read on public.documents for select to authenticated
  using (public.rag_can_read_document(id));
create policy document_versions_read on public.document_versions for select to authenticated
  using (public.rag_can_read_document(document_id));
create policy document_relationships_read on public.document_relationships for select to authenticated
  using (public.rag_can_read_version(source_document_version_id)
     and public.rag_can_read_version(target_document_version_id));
create policy document_approvals_read on public.document_approvals for select to authenticated
  using (public.rag_can_read_version(document_version_id));
create policy processing_jobs_read on public.processing_jobs for select to authenticated
  using (public.rag_can_read_version(document_version_id));
create policy parse_runs_read on public.parse_runs for select to authenticated
  using (public.rag_can_read_version(document_version_id));
create policy parsed_elements_read on public.parsed_elements for select to authenticated
  using (public.rag_can_read_version(document_version_id));
create policy chunks_read on public.chunks for select to authenticated
  using (public.rag_can_read_version(document_version_id));
create policy embedding_indexes_read on public.embedding_indexes for select to authenticated
  using (app_private.is_eventar_staff());
create policy retrieval_index_assignments_read on public.retrieval_index_assignments for select to authenticated
  using (app_private.is_eventar_staff());
create policy pack_versions_read on public.pack_versions for select to authenticated
  using (app_private.is_eventar_staff());
create policy pack_sources_read on public.pack_sources for select to authenticated
  using (app_private.is_eventar_staff());
create policy pack_source_passages_read on public.pack_source_passages for select to authenticated
  using (app_private.is_eventar_staff());
create policy evaluation_cases_read on public.evaluation_cases for select to authenticated
  using (app_private.is_eventar_staff());
create policy retrieval_traces_read on public.retrieval_traces for select to authenticated
  using (app_private.is_eventar_staff());

-- 4. Self-check: the replay fails if the grants are not what this file intends.
do $$
declare
  t text;
begin
  foreach t in array array[
    'processing_jobs','document_approvals','embedding_indexes','retrieval_index_assignments',
    'pack_versions','pack_sources','pack_source_passages'] loop
    if has_table_privilege('service_role', 'public.' || t, 'insert')
       or has_table_privilege('service_role', 'public.' || t, 'update')
       or has_table_privilege('service_role', 'public.' || t, 'delete') then
      raise exception 'B9 grant check: service_role can write audited table %', t;
    end if;
  end loop;
  foreach t in array array[
    'documents','document_versions','document_relationships','document_approvals',
    'processing_jobs','parse_runs','parsed_elements','chunks',
    'embedding_indexes','retrieval_index_assignments',
    'pack_versions','pack_sources','pack_source_passages',
    'evaluation_cases','retrieval_traces'] loop
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete')
       or has_table_privilege('service_role', 'public.' || t, 'truncate') then
      raise exception 'B9 grant check: unexpected privilege on %', t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'B9 grant check: authenticated cannot select %', t;
    end if;
  end loop;
end $$;

-- FILE: 20261117170000_rag_definer_functions.sql ----------------------------
-- Five functions. service_role only. Each one's LAST statement is the audit
-- write. p_actor is the auth user id of the requesting staff member (NULL =
-- system). p_actor_role is that person's staff role, or 'system'.
-- Audit payloads hold ids and codes only.

create function public.rag_enqueue_processing_job(
  p_document_version_id uuid, p_job_type text, p_idempotency_key text,
  p_actor uuid default null, p_actor_role text default 'system')
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_job_id uuid;
  v_org    uuid;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key required' using errcode = '22023';
  end if;
  select d.owner_organisation_id into v_org
    from public.document_versions v join public.documents d on d.id = v.document_id
   where v.id = p_document_version_id;
  if not found then
    raise exception 'document version not found' using errcode = '22023';
  end if;

  insert into public.processing_jobs (organisation_id, document_version_id, idempotency_key, job_type, requested_by)
  values (v_org, p_document_version_id, p_idempotency_key, p_job_type, p_actor)
  on conflict (idempotency_key) do nothing
  returning id into v_job_id;

  if v_job_id is null then            -- already enqueued: return it, no audit row
    select id into v_job_id from public.processing_jobs
     where idempotency_key = p_idempotency_key and document_version_id = p_document_version_id;
    if v_job_id is null then
      raise exception 'idempotency key belongs to another document version' using errcode = '22023';
    end if;
    return v_job_id;
  end if;

  perform public.write_audit_event('rag_job_enqueued', p_actor, p_actor_role, v_org,
    'processing_job', v_job_id,
    jsonb_build_object('document_version_id', p_document_version_id, 'job_type', p_job_type));
  return v_job_id;
end $$;

create function public.rag_record_document_approval(
  p_document_version_id uuid, p_approval_status text, p_approval_basis text,
  p_actor uuid default null, p_actor_role text default 'system')
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id  uuid;
  v_org uuid;
begin
  select d.owner_organisation_id into v_org
    from public.document_versions v join public.documents d on d.id = v.document_id
   where v.id = p_document_version_id;
  if not found then
    raise exception 'document version not found' using errcode = '22023';
  end if;

  insert into public.document_approvals
    (document_version_id, approval_status, approval_basis, approved_by, approved_at, withdrawn_by, withdrawn_at)
  values (p_document_version_id, p_approval_status, p_approval_basis,
    case when p_approval_status = 'approved'  then p_actor end,
    case when p_approval_status = 'approved'  then now()   end,
    case when p_approval_status = 'withdrawn' then p_actor end,
    case when p_approval_status = 'withdrawn' then now()   end)
  returning id into v_id;

  update public.document_versions
     set review_status = case p_approval_status
           when 'approved' then 'approved' when 'rejected' then 'rejected' else 'pending' end
   where id = p_document_version_id;

  perform public.write_audit_event('rag_document_approval_recorded', p_actor, p_actor_role, v_org,
    'document_version', p_document_version_id,
    jsonb_build_object('approval_id', v_id, 'approval_status', p_approval_status));
  return v_id;
end $$;

create function public.rag_create_embedding_index(
  p_name text, p_provider text, p_model text, p_dimension integer, p_chunk_version text,
  p_actor uuid default null, p_actor_role text default 'system')
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.embedding_indexes
    (id, name, provider, model, dimension, distance_metric, embedding_version, chunk_version, storage_table)
  values (v_id, p_name, p_provider, p_model, p_dimension, 'cosine', p_model, p_chunk_version,
    'emb_' || left(replace(v_id::text, '-', ''), 8));

  perform public.write_audit_event('rag_embedding_index_created', p_actor, p_actor_role, null,
    'embedding_index', v_id,
    jsonb_build_object('model', p_model, 'dimension', p_dimension, 'chunk_version', p_chunk_version));
  return v_id;
end $$;

create function public.rag_set_embedding_index_status(
  p_index_id uuid, p_new_status text,
  p_actor uuid default null, p_actor_role text default 'system')
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_old text;
begin
  select status into v_old from public.embedding_indexes where id = p_index_id for update;
  if not found then
    raise exception 'embedding index not found' using errcode = '22023';
  end if;
  if (v_old, p_new_status) not in (
      ('draft','building'), ('building','evaluating'), ('building','failed'),
      ('evaluating','approved'), ('evaluating','failed'),
      ('approved','active'), ('approved','retired'), ('active','retired')) then
    raise exception 'transition % -> % not allowed', v_old, p_new_status using errcode = '22023';
  end if;

  if p_new_status = 'retired' and exists (
      select 1 from public.retrieval_index_assignments
       where active_embedding_index_id = p_index_id and effective_to is null) then
    raise exception 'index still has an open assignment' using errcode = '22023';
  end if;

  update public.embedding_indexes
     set status = p_new_status,
         activated_at = case when p_new_status = 'active'  then now() else activated_at end,
         retired_at   = case when p_new_status = 'retired' then now() else retired_at   end
   where id = p_index_id;

  perform public.write_audit_event('rag_embedding_index_status_changed', p_actor, p_actor_role, null,
    'embedding_index', p_index_id,
    jsonb_build_object('from', v_old, 'to', p_new_status));
end $$;

create function public.rag_assign_retrieval_index(
  p_scope_type text, p_organisation_id uuid, p_document_family text, p_embedding_index_id uuid,
  p_actor uuid default null, p_actor_role text default 'system')
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_status   text;
  v_previous uuid;
  v_id       uuid;
begin
  select status into v_status from public.embedding_indexes where id = p_embedding_index_id for update;
  if not found or v_status not in ('approved','active') then
    raise exception 'index must be approved or active' using errcode = '22023';
  end if;

  update public.retrieval_index_assignments
     set effective_to = now()
   where scope_type = p_scope_type
     and organisation_id is not distinct from p_organisation_id
     and document_family = p_document_family
     and effective_to is null
  returning active_embedding_index_id into v_previous;

  insert into public.retrieval_index_assignments
    (scope_type, organisation_id, document_family, active_embedding_index_id, approved_by)
  values (p_scope_type, p_organisation_id, p_document_family, p_embedding_index_id, p_actor)
  returning id into v_id;

  if v_status = 'approved' then
    update public.embedding_indexes set status = 'active', activated_at = now() where id = p_embedding_index_id;
  end if;

  perform public.write_audit_event('rag_index_assigned', p_actor, p_actor_role, p_organisation_id,
    'retrieval_index_assignment', v_id,
    jsonb_build_object('embedding_index_id', p_embedding_index_id, 'previous_embedding_index_id', v_previous,
                       'scope_type', p_scope_type, 'document_family', p_document_family));
  return v_id;
end $$;

revoke all on function public.rag_enqueue_processing_job(uuid, text, text, uuid, text)            from public, anon, authenticated;
revoke all on function public.rag_record_document_approval(uuid, text, text, uuid, text)          from public, anon, authenticated;
revoke all on function public.rag_create_embedding_index(text, text, text, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.rag_set_embedding_index_status(uuid, text, uuid, text)              from public, anon, authenticated;
revoke all on function public.rag_assign_retrieval_index(text, uuid, text, uuid, uuid, text)      from public, anon, authenticated;
grant execute on function public.rag_enqueue_processing_job(uuid, text, text, uuid, text)            to service_role;
grant execute on function public.rag_record_document_approval(uuid, text, text, uuid, text)          to service_role;
grant execute on function public.rag_create_embedding_index(text, text, text, integer, text, uuid, text) to service_role;
grant execute on function public.rag_set_embedding_index_status(uuid, text, uuid, text)              to service_role;
grant execute on function public.rag_assign_retrieval_index(text, uuid, text, uuid, uuid, text)      to service_role;

-- Self-check: the replay fails if a function is callable by the wrong role.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rag_enqueue_processing_job(uuid, text, text, uuid, text)',
    'public.rag_record_document_approval(uuid, text, text, uuid, text)',
    'public.rag_create_embedding_index(text, text, text, integer, text, uuid, text)',
    'public.rag_set_embedding_index_status(uuid, text, uuid, text)',
    'public.rag_assign_retrieval_index(text, uuid, text, uuid, uuid, text)'] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'B9 grant check: wrong execute privilege on %', f;
    end if;
  end loop;
end $$;
