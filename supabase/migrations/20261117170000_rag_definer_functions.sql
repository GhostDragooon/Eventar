-- B9 RAG: the five SECURITY DEFINER write functions and their execute self-check.
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

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
