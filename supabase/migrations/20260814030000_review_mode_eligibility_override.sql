-- 2026-08-14, same session as 20260814020000 — found immediately after that
-- fix, while backtesting the check-in page it unblocked: the roster's CPD-
-- eligibility hints showed "couldn't be checked just now" instead of the
-- real per-attendee eligibility. Same root cause, same class, missed in the
-- first pass because this one degrades gracefully (rule 12 — the read's own
-- comment says "must render even if this read fails") rather than 500ing, so
-- it didn't surface as a broken button, just a silently degraded one.
--
-- Same fix, same shape as 20260814020000: thread an actor override through
-- app_private.resolve_actor() instead of the raw require_active_staff() call.

drop function public.event_registration_eligibility(uuid);

create function public.event_registration_eligibility(p_event_id uuid, p_actor_override uuid default null)
returns table(registration_id uuid, eligibility text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor   public.staff%rowtype;
  v_event public.events%rowtype;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_registration_eligibility: event % not found', p_event_id
      using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_event.created_by <> actor.id then
    raise exception 'event_registration_eligibility: not the owner of event %', p_event_id
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    case
      when v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0
        then 'not_cpd'
      when r.status = 'cancelled' then 'cancelled'
      when u.id is null then 'no_account'
      when l.id is null then 'no_licence'
      else 'eligible'
    end
  from public.registrations r
  left join auth.users u
    on lower(u.email) = lower(trim(r.email))
  left join lateral (
    select pl.id from public.practitioner_licences pl
     where pl.user_id = u.id
       and pl.body_id = v_event.accrediting_body_id
       and pl.status = 'verified'
     order by pl.created_at desc
     limit 1
  ) l on true
  where r.event_id = p_event_id;
end;
$$;

revoke execute on function public.event_registration_eligibility(uuid, uuid) from public, anon;
grant execute on function public.event_registration_eligibility(uuid, uuid) to authenticated, service_role;

do $$
begin
  if not has_function_privilege('authenticated','public.event_registration_eligibility(uuid, uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.event_registration_eligibility(uuid, uuid)','EXECUTE') then
    raise exception 'event_registration_eligibility lost a grant it needs';
  end if;
  if has_function_privilege('anon','public.event_registration_eligibility(uuid, uuid)','EXECUTE') then
    raise exception 'event_registration_eligibility: anon should not be able to execute this';
  end if;
end $$;

-- Rollback:
--   drop function public.event_registration_eligibility(uuid, uuid);
--   create function public.event_registration_eligibility(p_event_id uuid) ...
--     (restore the body from 20260804050000_roster_licence_eligibility.sql)
