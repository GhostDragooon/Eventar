-- F1 (MVP walk r3 and r4, Ivan 2026-11-21 "continue with the MVP"): a speaker check-in only lands inside the event's
-- check-in window, at the database.
--
-- toggleSpeakerCheckin (app/events/[id]/checkin/speakerActions.ts) refuses outside [start - 60 min, end] via
-- computeLifecycle, but the speaker_checkins policies do not look at the clock. Any authenticated member of the
-- organisation could INSERT or UPDATE a row through PostgREST 5 hours before the window opened, with no error.
-- This is the same gap DB-02 (20261023170000) closed for registrations.
--
-- Rule: from 60 minutes before events.start_time until events.end_time (the same CHECKIN_OPEN_MINUTES and the same
-- event-level window as mark_attended for a one-occurrence event). Ticking and clearing a tick are both refused
-- outside it, as the Server Action does. Refusals are SQLSTATE 23514 with `check_in_not_open_yet` or
-- `check_in_closed`.
--
-- Scope: the API roles only (authenticated, anon). service_role and the superuser keep writing at any time, for
-- fixtures and erasure. The function is SECURITY INVOKER, so current_user is the API role; the event is read under
-- the caller's own RLS. A caller who cannot see the event gets no row here and is refused by the speaker_checkins
-- policies as before.
--
-- Not covered: a draft or cancelled event inside its clock window. The Server Action refuses those; this trigger is
-- the clock only (the same split as DB-02).
--
-- Rollback: drop trigger speaker_checkins_inside_window on public.speaker_checkins;
--           drop function app_private.speaker_checkin_inside_window();

create or replace function app_private.speaker_checkin_inside_window()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select e.start_time, e.end_time into v_start, v_end from public.events e where e.id = new.event_id;
  if v_start is null then
    return new;
  end if;

  if now() < v_start - interval '60 minutes' then
    raise exception 'check_in_not_open_yet' using errcode = 'check_violation';
  elsif now() > v_end then
    raise exception 'check_in_closed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger speaker_checkins_inside_window
  before insert or update on public.speaker_checkins
  for each row execute function app_private.speaker_checkin_inside_window();
