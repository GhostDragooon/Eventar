-- Closes a gap named by an external code-review doc (2026-08-16, reviewed
-- and partially validated this session) and, independently, already
-- anticipated in this repo's own history: 20260802182411's own comment on
-- locking events.status said "a future organiser-facing cancel surface
-- needs its own audited definer function, which is fitting rule 4, not a
-- new cost" — that future surface is this migration.
--
-- app/dashboard/actions.ts's cancelEvents/softDeleteEvents/restoreEvents
-- all share bulkUpdate(), which does a raw `admin.from('events').update()`
-- — no audit_events row, ever, for any of the three. Verified before
-- writing this: zero write_audit_event calls anywhere under app/events/ or
-- app/dashboard/, and events.status/deleted_at are the ONLY columns any
-- app-layer code writes without going through an audited definer function
-- (title/topic/etc. go through update_event_with_blocks, which correctly
-- never touches status; status itself already goes through publish_event
-- for the 'published' transition — 'cancelled' and deleted_at were the
-- gap). Scope: all three actions in one pass (cancel + soft_delete +
-- restore), not just cancel — same missing-audit shape, Ivan's call.
--
-- ONE shared function, not three near-copies of publish_event: the three
-- actions differ only in which column(s) change and the audit event_type,
-- and the app already treats them as one code path (bulkUpdate). Mirrors
-- publish_event's own auth shape (app_private.resolve_actor, same three
-- organiser roles) and its ownership check, WIDENED to match bulkUpdate's
-- EXISTING behavior exactly: publish_event requires created_by = actor.id
-- unconditionally, but bulkUpdate already lets eventar_staff act on ANY
-- event (JS: `if (staff.role !== 'eventar_staff') q = q.eq('created_by',
-- staff.id)`) — narrowing that silently would be a real regression nobody
-- asked for, so the WHERE clause below carries the same eventar_staff
-- bypass bulkUpdate already has.
--
-- p_actor_user_id is a SEPARATE parameter from p_actor_override (a
-- staff.id, resolved via resolve_actor) because audit_events.actor_user_id
-- is conventionally the AUTH user id everywhere else it's written
-- (publish_event's own `auth.uid()`, credit_ledger.actor_id's "references
-- public.users(id), NOT staff.id" — see app/events/[id]/checkin/
-- actions.ts). This function is designed to always be called via the
-- service_role client (matching cancelEvents' current, unchanged
-- transport) + p_actor_override, so auth.uid() would resolve to NULL
-- inside it — the caller passes the real auth id explicitly instead,
-- exactly as app/events/[id]/checkin/actions.ts already does for
-- award_attendance_credit's actorId via a separate supabase.auth.getUser()
-- call on the session client (read-only, no transport change needed for
-- the actual table write).
create or replace function public.bulk_update_event_status(
  p_event_ids       uuid[],
  p_action          text,
  p_actor_override  uuid default null,
  p_actor_user_id   uuid default null
) returns table(id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor              public.staff%rowtype;
  v_event_type       text;
  v_ids              uuid[];
  v_prev_statuses    text[];
  v_prev_deleted_ats timestamptz[];
  v_org_ids          uuid[];
  i                  integer;
begin
  -- No role list: bulkUpdate's ORIGINAL gate was ownership, not role — any
  -- of the 5 staff roles (organiser_admin/organiser_member/body_admin/
  -- auditor/eventar_staff) could act on an event they created. Restricting
  -- to publish_event's 3-role list (a DIFFERENT surface with a DIFFERENT,
  -- narrower audience) would silently reject a body_admin or auditor who
  -- owns an event they created — found on review, not asked for, not
  -- shipping it. Ownership (or eventar_staff) stays the real gate, in the
  -- WHERE clause below, exactly matching bulkUpdate's prior behavior.
  -- `variadic array[]::text[]`, not a bare omitted argument: Postgres does
  -- NOT resolve `resolve_actor(p_actor_override)` alone to a zero-element
  -- variadic call — confirmed live (42883 "function ... does not exist")
  -- before writing this comment. require_active_staff() treats an empty
  -- array the same as NULL ("any role"), so this is equivalent to
  -- publish_event's role list, just empty.
  actor := app_private.resolve_actor(p_actor_override, variadic array[]::text[]);

  if p_action = 'cancel' then
    v_event_type := 'event_cancelled';
  elsif p_action = 'soft_delete' then
    v_event_type := 'event_soft_deleted';
  elsif p_action = 'restore' then
    v_event_type := 'event_restored';
  else
    raise exception 'bulk_update_event_status: unknown action %', p_action using errcode = '22023';
  end if;

  -- Single set-based statement: `old` snapshots PRIOR values (FOR UPDATE —
  -- locks the rows), `upd` applies the actual change, the outer SELECT
  -- aggregates the result into parallel arrays. RETURNING always reflects
  -- POST-update values, which is why prior state has to come from a
  -- separate snapshot CTE, not from the UPDATE's own RETURNING. Nothing
  -- but the audit-writing loop below runs after this statement — the
  -- audit-chain advisory lock (held from first insert to commit) is never
  -- extended by an interleaved non-audit write (CLAUDE.md "audit insert
  -- last"), which a naive per-row "update one, then audit it, then update
  -- the next" loop would do.
  -- Table-aliased and fully qualified throughout: this function's OUT
  -- parameter `id` (from `returns table(id uuid)`) is visible as a
  -- PL/pgSQL variable inside every SQL statement in the body, so a bare
  -- `id` here is genuinely ambiguous against `events.id` (42702) — caught
  -- by actually calling the function, not by the migration's own
  -- structural self-check, which only confirms the function exists.
  -- The `and case ...` clause is an idempotency guard: only rows the action
  -- would ACTUALLY change are touched at all, mirroring publish_event's own
  -- `status is distinct from 'published'`. Without it, re-cancelling an
  -- already-cancelled event (or restoring a never-deleted one) would still
  -- update nothing meaningfully but post a misleading audit row claiming a
  -- transition that didn't happen — found on review, not asked for.
  with old as (
    select e.id, e.status as prev_status, e.deleted_at as prev_deleted_at, e.organisation_id
    from public.events e
    where e.id = any(p_event_ids)
      and (e.created_by = actor.id or actor.role = 'eventar_staff')
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
$$;

revoke execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) from public, anon;
grant execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying checks — structural/metadata only. A live functional test
-- would leave a permanent audit_events row on every environment this runs
-- on (audit_events is chain-based, no deletion path — same reasoning
-- 20260815050000 gave for skipping a live insert here). Functional
-- behaviour is covered by app/dashboard/actions.test.ts (mocked) plus
-- manual local verification before this shipped to Seoul.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'bulk_update_event_status'
      and pg_get_function_arguments(p.oid) = 'p_event_ids uuid[], p_action text, p_actor_override uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid'
  ) then
    raise exception 'bulk_update_event_status: missing or signature drifted';
  end if;

  if has_function_privilege('anon', 'public.bulk_update_event_status(uuid[], text, uuid, uuid)', 'EXECUTE') then
    raise exception 'bulk_update_event_status: anon must NOT have EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.bulk_update_event_status(uuid[], text, uuid, uuid)', 'EXECUTE') then
    raise exception 'bulk_update_event_status: authenticated must have EXECUTE';
  end if;
  if not has_function_privilege('service_role', 'public.bulk_update_event_status(uuid[], text, uuid, uuid)', 'EXECUTE') then
    raise exception 'bulk_update_event_status: service_role must have EXECUTE';
  end if;

  -- write_audit_event and resolve_actor are called into but untouched by
  -- this migration — confirm neither signature drifted, same paranoid
  -- style as every prior migration that calls into shared helpers.
  if not exists (
    select 1 from pg_proc
    where proname = 'write_audit_event'
      and pg_get_function_arguments(oid) like 'p_event_type text, p_actor_user_id uuid DEFAULT%p_actor_role text DEFAULT%p_organisation_id uuid DEFAULT%p_subject_type text DEFAULT%p_subject_id uuid DEFAULT%p_payload jsonb DEFAULT%'
  ) then
    raise exception 'bulk_update_event_status: write_audit_event signature drifted from what this migration assumes';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'resolve_actor' and pronamespace = 'app_private'::regnamespace
      and pg_get_function_arguments(oid) like 'p_actor_override uuid, VARIADIC p_roles text[]%'
  ) then
    raise exception 'bulk_update_event_status: app_private.resolve_actor signature drifted from what this migration assumes';
  end if;
end $$;

-- Rollback (safe any time — adds no column, no table; reverting means
-- dropping the function and reverting app/dashboard/actions.ts to call
-- .update() directly again):
--   revoke all on function public.bulk_update_event_status(uuid[], text, uuid, uuid) from authenticated, service_role;
--   drop function if exists public.bulk_update_event_status(uuid[], text, uuid, uuid);
