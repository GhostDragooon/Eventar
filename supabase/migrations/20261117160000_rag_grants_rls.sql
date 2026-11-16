-- B9 RAG: read helpers, grants (Hard Rule 11), row-level security, grant self-check.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

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
