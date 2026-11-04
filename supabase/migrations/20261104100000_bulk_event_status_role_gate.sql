-- Security audit 2026-11-04 (docs/plans/security-audit-20261104.md, M1): bulk_update_event_status() named no
-- roles, so any active staff role, auditor and body_admin included, could cancel or soft-delete every event in
-- its organisation (org scope since 20260910000000). It was also executable by `authenticated`, and an
-- `authenticated` caller could pass any p_actor_user_id: audit_events then recorded that user as the actor
-- (executed on the local stack, 2026-11-04).
--
-- 1. Role list: organiser_admin, organiser_member, eventar_staff, the same three as publish_event. A refused
--    role raises 42501 from resolve_actor, before any row is read or written.
-- 2. EXECUTE now belongs to service_role only. The one caller, app/dashboard/actions.ts, uses the admin client
--    and passes the actor it resolved from the session, so nothing in the app changes. An `authenticated`
--    JWT can no longer reach the function, which closes the forged-actor path.
--
-- Body otherwise byte-identical to the live definition (20260910000000, section 13d).
-- Edge case, surfaced not decided: a body_admin or auditor who created a draft can no longer bulk-archive it.
-- The role matrix for those two is a post-MVP call (Ivan, 2026-11-04).
--
-- Rollback (restore the previous definition and ACL): re-create public.bulk_update_event_status(uuid[], text,
-- uuid, uuid) from section 13d of 20260910000000_authority_sweep_org_scope.sql (the last file that defined it,
-- found by grep), then `grant execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid)
-- to authenticated;`. Nothing else in this file needs undoing.

CREATE OR REPLACE FUNCTION public.bulk_update_event_status(p_event_ids uuid[], p_action text, p_actor_override uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor              public.staff%rowtype;
  v_event_type       text;
  v_ids              uuid[];
  v_prev_statuses    text[];
  v_prev_deleted_ats timestamptz[];
  v_org_ids          uuid[];
  i                  integer;
begin
  actor := app_private.resolve_actor(p_actor_override, variadic array['organiser_admin', 'organiser_member', 'eventar_staff']);

  if p_action = 'cancel' then
    v_event_type := 'event_cancelled';
  elsif p_action = 'soft_delete' then
    v_event_type := 'event_soft_deleted';
  elsif p_action = 'restore' then
    v_event_type := 'event_restored';
  else
    raise exception 'bulk_update_event_status: unknown action %', p_action using errcode = '22023';
  end if;

  with old as (
    select e.id, e.status as prev_status, e.deleted_at as prev_deleted_at, e.organisation_id
    from public.events e
    where e.id = any(p_event_ids)
      and (e.organisation_id = actor.organisation_id or actor.role = 'eventar_staff')
      and case
            when p_action = 'cancel' then e.status is distinct from 'cancelled'
            when p_action = 'soft_delete' then e.deleted_at is null
            when p_action = 'restore' then e.deleted_at is not null
          end
    for update
  ),
  upd as (
    update public.events e set
      status     = case when p_action = 'cancel' then 'cancelled' else e.status end,
      deleted_at = case when p_action = 'soft_delete' then now()
                        when p_action = 'restore' then null
                        else e.deleted_at end
    from old
    where e.id = old.id
    returning e.id
  )
  select array_agg(old.id), array_agg(old.prev_status), array_agg(old.prev_deleted_at), array_agg(old.organisation_id)
    into v_ids, v_prev_statuses, v_prev_deleted_ats, v_org_ids
  from old
  join upd on upd.id = old.id;

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    perform public.write_audit_event(
      v_event_type, p_actor_user_id, actor.role, v_org_ids[i], 'event', v_ids[i],
      jsonb_build_object('previous_status', v_prev_statuses[i], 'previous_deleted_at', v_prev_deleted_ats[i])
    );
    id := v_ids[i];
    return next;
  end loop;
end;
$function$;

revoke execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) to service_role;

do $$
declare
  fn  regprocedure := 'public.bulk_update_event_status(uuid[], text, uuid, uuid)'::regprocedure;
  acl text := (select proacl::text from pg_proc where oid = fn);
begin
  assert not has_function_privilege('anon', fn, 'EXECUTE'), 'anon must not execute bulk_update_event_status';
  assert not has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated must not execute bulk_update_event_status';
  assert has_function_privilege('service_role', fn, 'EXECUTE'), 'service_role must keep EXECUTE';
  assert acl !~ '(^|[{,])=', 'PUBLIC must not hold EXECUTE';
  assert pg_get_functiondef(fn) like '%''organiser_admin'', ''organiser_member'', ''eventar_staff''%', 'role list missing';
end
$$;
