-- M7, capacity half (security audit 2026-11-04). registerForEvent and the staff walk-in action each count an event's
-- registrations with one query and insert with another ("best-effort under concurrent submissions"), so N concurrent
-- submits all read "one seat left" and all insert; an event can be oversubscribed by anyone who can submit in parallel.
--
-- The limit is now also enforced where the row is written: a BEFORE INSERT trigger takes the event row lock
-- (FOR NO KEY UPDATE, the lock publish_event and update_event_with_blocks take; foreign-key KEY SHARE checks do not
-- wait on it), counts, and refuses with 'event_at_capacity' (SQLSTATE 23514). Concurrent inserts for one event queue
-- on that lock, and each count runs after the previous insert has committed.
--
-- Same rule as the two actions, so nothing the app allowed before is refused now except the overflow: events with
-- max_attendees null are unlimited; every registration row of the event counts, whatever its status or source. The
-- actions keep their own pre-check (friendly message, no wasted email_log row on the common case) and map this error to
-- the same sentence. SECURITY DEFINER with a pinned search_path so the count is not filtered by the caller's RLS.

create or replace function app_private.registrations_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_max integer;
  v_n   integer;
begin
  select max_attendees into v_max from public.events where id = new.event_id for no key update;
  if v_max is null then
    return new;
  end if;
  select count(*) into v_n from public.registrations where event_id = new.event_id;
  if v_n >= v_max then
    raise exception 'event_at_capacity: event % has % of % places taken', new.event_id, v_n, v_max
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function app_private.registrations_capacity_guard() from public, anon, authenticated;

create trigger registrations_capacity_guard_trg
  before insert on public.registrations
  for each row execute function app_private.registrations_capacity_guard();

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'registrations_capacity_guard_trg' and tgrelid = 'public.registrations'::regclass and not tgisinternal
  ) then
    raise exception 'registrations_capacity_guard_trg missing after create';
  end if;
  if (
    select count(*) from public.events e
     where e.max_attendees is not null
       and (select count(*) from public.registrations r where r.event_id = e.id) > e.max_attendees
  ) > 0 then
    raise notice 'registrations_capacity_guard: some events already hold more registrations than max_attendees (left as they are; the guard only refuses new inserts)';
  end if;
end $$;
