-- 2026-10-02 — publish_event can transition only an active draft.
--
-- Security review (P2a): the previous WHERE clause accepted every event whose
-- status was not already 'published'. A caller with publish permission could
-- therefore publish a cancelled or soft-deleted event by invoking the server
-- action or RPC directly. The organiser surface offers publish only for drafts;
-- enforce that same transition at the database boundary.
--
-- Keep a repeat publish of an already-published, active event idempotent, and
-- preserve actor resolution, organisation scope, grants, and the final audit
-- write. create_event_with_blocks creates a draft first, then calls this RPC.
--
-- Rollback: re-apply the definition in section 13a of
-- 20260910000000_authority_sweep_org_scope.sql with create or replace (it accepted
-- any status other than 'published'); grants are untouched either way.
-- The DO block at the end is a text match at apply time, and the grant half is the
-- only part that proves anything about the database. The proof of BEHAVIOUR is
-- tests/rls/create_event_publish_actor.rls.test.ts ("a repeated publish is
-- idempotent, while cancelled and deleted events stay unpublished").

create or replace function public.publish_event(p_event_id uuid, p_actor_override uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor public.staff%rowtype;
  v_org uuid;
  v_status text;
  v_deleted_at timestamptz;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');

  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id
     and (organisation_id = actor.organisation_id or actor.role = 'eventar_staff')
     and status = 'draft'
     and deleted_at is null
   returning organisation_id into v_org;

  if not found then
    select status, deleted_at
      into v_status, v_deleted_at
      from public.events
     where id = p_event_id
       and (organisation_id = actor.organisation_id or actor.role = 'eventar_staff');

    if found then
      if v_status = 'published' and v_deleted_at is null then
        return;
      end if;
      raise exception 'publish_event: only an active draft can be published'
        using errcode = '22023';
    end if;

    raise exception 'publish_event: event % not found or not in caller''s organisation', p_event_id
      using errcode = '42501';
  end if;

  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')
  );
end;
$$;

do $$
declare
  def text := pg_get_functiondef('public.publish_event(uuid,uuid)'::regprocedure);
begin
  if position('status = ''draft''' in def) = 0 or position('deleted_at is null' in def) = 0 then
    raise exception 'publish_event must require an active draft';
  end if;
  if position('event_published' in def) = 0 then
    raise exception 'publish_event lost its audit write';
  end if;
  if not has_function_privilege('authenticated', 'public.publish_event(uuid,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.publish_event(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.publish_event(uuid,uuid)', 'execute') then
    raise exception 'publish_event grants drifted';
  end if;
end;
$$;
