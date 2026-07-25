-- CPD MVP Stage 8 (🟡, Ivan-confirmed 2026-07-25) — event-config freeze trigger.
-- Execution plan Task 8: once a credit already references an event, changing
-- accrediting_body_id/cpd_hours would make future issuance inconsistent with
-- what already posted (the ledger itself is already tamper-safe via the
-- snapshot on each row — this only guards *future* credits at this event
-- from drifting off the config the earlier ones were issued under).
--
-- security definer: an event's owner (organiser) has no RLS-visibility into
-- credit_ledger for that event (only credit_ledger_self_read /
-- _body_admin_read exist), so a security-invoker trigger would see zero rows
-- and never fire. Matches the definer-for-authoritative-check precedent used
-- elsewhere in this build (award_attendance_credit).
create or replace function public.freeze_cpd_config_if_credited() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  if (new.cpd_hours is distinct from old.cpd_hours
      or new.accrediting_body_id is distinct from old.accrediting_body_id)
     and exists (select 1 from public.credit_ledger where event_id = old.id) then
    raise exception 'events: cannot change cpd_hours/accrediting_body_id on event % — credit already issued', old.id
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_cpd_config_if_credited() from public, anon, authenticated;

create trigger events_freeze_cpd_config_if_credited
  before update on public.events
  for each row execute function public.freeze_cpd_config_if_credited();

-- Rollback:
--   drop trigger if exists events_freeze_cpd_config_if_credited on public.events;
--   drop function if exists public.freeze_cpd_config_if_credited();
