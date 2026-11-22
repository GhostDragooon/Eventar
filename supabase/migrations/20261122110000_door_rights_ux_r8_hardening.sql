-- UX-R8 review follow-up (2026-11-22), after the dev and user lenses on e45e45f.
--   1. speaker_checkins INSERT/UPDATE policies: eventar_staff of any organisation passes, like can_run_door and the
--      guard already say ("eventar_staff on every event"). Before, only the event's own organisation passed RLS.
--   2. enforce_event_writer, speaker door branch: a door role that is not the event's writer must stamp its OWN staff id
--      in updated_by and a checked_in_at near now() (or null, to clear). Before, it could write another staff id or
--      a back-dated time on a colleague's speaker row. The event's writer is unaffected (falls through to can_write_event).
-- Known ceiling: app.door_registration stays set until the transaction ends. Nothing runs after mark_attended in the
-- same PostgREST call today; a future definer function that calls it and then writes registrations would inherit the
-- exemption. Reset it there if that ever happens.
--
-- Rollback: restore the two policies from 20260910000000_authority_sweep_org_scope.sql (current_staff_org_id only)
-- and enforce_event_writer from 20261122100000_door_rights_ux_r8.sql.

drop policy speaker_checkins_org_member_insert on public.speaker_checkins;
create policy speaker_checkins_org_member_insert on public.speaker_checkins for insert to authenticated
  with check (app_private.is_eventar_staff() or exists (
    select 1 from public.events e where e.id = speaker_checkins.event_id and e.organisation_id = app_private.current_staff_org_id()));

drop policy speaker_checkins_org_member_update on public.speaker_checkins;
create policy speaker_checkins_org_member_update on public.speaker_checkins for update to authenticated
  using (app_private.is_eventar_staff() or exists (
    select 1 from public.events e where e.id = speaker_checkins.event_id and e.organisation_id = app_private.current_staff_org_id()))
  with check (app_private.is_eventar_staff() or exists (
    select 1 from public.events e where e.id = speaker_checkins.event_id and e.organisation_id = app_private.current_staff_org_id()));

CREATE OR REPLACE FUNCTION app_private.enforce_event_writer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff uuid;
  v_role  text;
  v_row   jsonb;
  v_event uuid;
  v_keep  text[] := array['user_id', 'profile_snapshot', 'updated_at'];
  v_new   jsonb;
  v_old   jsonb;
  v_door  boolean;
begin
  if auth.role() = 'service_role' then return coalesce(new, old); end if;
  v_staff := app_private.current_staff_id();
  if v_staff is null then return coalesce(new, old); end if;   -- not staff: RLS and the table's own gates decide

  if tg_table_name = 'events' and tg_op = 'INSERT' then
    select s.role into v_role from public.staff s where s.id = v_staff;
    if v_role not in ('organiser_admin', 'organiser_member', 'eventar_staff') or new.created_by is distinct from v_staff then
      raise exception 'events: your role cannot create events, or created_by is not you'
        using errcode = '42501', detail = 'not_event_writer';
    end if;
    return new;
  end if;

  -- A staff account is also a practitioner account (one auth.users row). Its own claim of its own registration
  -- (claim_registrations_for_user: user_id null -> itself, profile_snapshot filled, nothing else) is not an
  -- organiser action, so the organiser rule does not apply to it.
  if tg_table_name = 'registrations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'user_id' is null and to_jsonb(new)->>'user_id' = auth.uid()::text
       and (to_jsonb(new) - v_keep) = (to_jsonb(old) - v_keep) then
      return new;
    end if;
  end if;

  -- UX-R8 (Ivan, 2026-11-22): the door is open to every door role of the event's organisation (can_run_door), not
  -- only its writer. Exactly four writes, each narrow:
  --   speaker_checkins  INSERT, and UPDATE that touches only checked_in_at / updated_by (both pinned: own staff id, time near now());
  --   registration_checkins INSERT, and registrations UPDATE of status registered -> attended (plus the
  --   check_in_at / check_in_method the sync trigger fills), both only while mark_attended has named that one
  --   registration in app.door_registration (a transaction-local setting only that definer function sets).
  -- Everything else on these tables, and every other guarded table, keeps the writer rule below.
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
    v_old := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    v_door := case
      -- UX-R8 review: the door role stamps itself and the present time (null clears a tick), never another staff id
      -- or a back-dated time.
      when tg_table_name = 'speaker_checkins' and tg_op = 'INSERT'
        then v_new->>'updated_by' = v_staff::text
             and (v_new->>'checked_in_at' is null or abs(extract(epoch from now() - (v_new->>'checked_in_at')::timestamptz)) < 300)
      when tg_table_name = 'speaker_checkins' and tg_op = 'UPDATE'
        then (v_new - 'checked_in_at' - 'updated_by') = (v_old - 'checked_in_at' - 'updated_by')
             and v_new->>'updated_by' = v_staff::text
             and (v_new->>'checked_in_at' is null or abs(extract(epoch from now() - (v_new->>'checked_in_at')::timestamptz)) < 300)
      when tg_table_name = 'registration_checkins' and tg_op = 'INSERT'
        then current_setting('app.door_registration', true) = v_new->>'registration_id'
      when tg_table_name = 'registrations' and tg_op = 'UPDATE'
        then current_setting('app.door_registration', true) = v_old->>'id'
             and (v_new - 'status' - 'check_in_at' - 'check_in_method') = (v_old - 'status' - 'check_in_at' - 'check_in_method')
             and (v_new->>'status' = v_old->>'status'
                  or (v_old->>'status' = 'registered' and v_new->>'status' = 'attended'))
      else false end;
    if v_door and app_private.can_run_door(app_private.event_of_row(tg_table_name, v_new), v_staff) then
      return new;
    end if;
  end if;

  -- An UPDATE is checked against the event it leaves AND the event it lands on (a row moved onto your own event
  -- from a colleague's must not pass), INSERT against NEW, DELETE against OLD.
  foreach v_row in array case tg_op when 'UPDATE' then array[to_jsonb(old), to_jsonb(new)]
                                    when 'INSERT' then array[to_jsonb(new)]
                                    else array[to_jsonb(old)] end loop
    v_event := app_private.event_of_row(tg_table_name, v_row);
    -- A cascade delete after the parent event (or link row) is gone: the parent's own guard already ran.
    if tg_op = 'DELETE' and (v_event is null or not exists (select 1 from public.events e where e.id = v_event)) then
      continue;
    end if;
    if not app_private.can_write_event(v_event, v_staff) then
      raise exception '%: you cannot change event %', tg_table_name, v_event
        using errcode = '42501', detail = 'not_event_writer';
    end if;
  end loop;
  return coalesce(new, old);
end;
$function$;
