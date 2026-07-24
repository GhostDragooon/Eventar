-- CPD MVP Stage 2 — attendance-credit issuance definer + schema corrections.
-- Three fixes the Stage-2 build surfaced (plan assumptions vs schema reality):
--   1. attestation_status CHECK lacked 'attendance_verified' (a real verification
--      tier — venue-captured attendance is stronger provenance than an organiser's
--      manual claim). Widen it (Ivan-confirmed 2026-07-24).
--   2. The Stage-1 idempotency index keyed on entry_type='attendance', which the
--      entry_type CHECK forbids — so it guarded nothing. Re-key to the real
--      values: one credit_earned + attendance_verified per (user, event).
--   3. Identity resolution needs auth.users (public.users has no email column),
--      so it lives in this SECURITY DEFINER function, not in TS.

-- (1) widen the attestation tier set.
alter table public.credit_ledger drop constraint credit_ledger_attestation_status_check;
alter table public.credit_ledger add constraint credit_ledger_attestation_status_check
  check (attestation_status = any (array['organiser_attested','body_confirmed','attendance_verified']));

-- (2) fix the idempotency backstop (the old entry_type='attendance' index was inert).
drop index if exists public.credit_ledger_attendance_uniq;
create unique index if not exists credit_ledger_attendance_uniq
  on public.credit_ledger (user_id, event_id)
  where entry_type = 'credit_earned' and attestation_status = 'attendance_verified';

-- (3) award_attendance_credit: guard → resolve identity → issue. Config-free
-- (no body_rules). Called by the attendance Server Actions AFTER a fresh check-in,
-- in its own transaction (decoupled). Returns a status string; the TS wrapper logs
-- it (ids only) and never lets a failure change the attendance outcome.
-- service_role-only; owner (postgres) reads auth.users and calls the record_credit_entry
-- definer, both of which run under this definer's rights.
create or replace function public.award_attendance_credit(
  p_event_id uuid, p_registration_code text, p_actor_id uuid default null
) returns text
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_event   public.events%rowtype;
  v_email   text;
  v_user_id uuid;
  v_licence public.practitioner_licences%rowtype;
  v_eff     date;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then return 'skipped:no_event'; end if;

  -- eligibility: only CPD-configured events issue credit (guards ledger pollution).
  if v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0 then
    return 'skipped:not_cpd';
  end if;

  select email into v_email from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  if not found then return 'skipped:no_registration'; end if;

  -- email → auth user (case-insensitive, trimmed). auth.users is the only place
  -- email lives; public.users mirrors it by id.
  select id into v_user_id from auth.users
    where lower(email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then return 'skipped:no_user'; end if;

  -- active licence at THIS event's body, deterministic pick.
  select * into v_licence from public.practitioner_licences
    where user_id = v_user_id and body_id = v_event.accrediting_body_id and status = 'active'
    order by created_at desc limit 1;
  if not found then return 'skipped:no_licence'; end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  begin
    perform public.record_credit_entry(
      v_licence.id, v_user_id, p_event_id, v_event.accrediting_body_id,
      'credit_earned', null, v_event.cpd_hours, null,
      v_eff, 'attendance_verified', p_actor_id
    );
  exception when unique_violation then
    return 'already';   -- the (user,event) partial-unique backstop fired
  end;

  return 'issued';
end;
$$;

revoke execute on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;
