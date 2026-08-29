-- Stage D / follow-up — registration_credit_status gains 'pending' return.
--
-- D4 user-lens BLOCKER (B1). Pre-plan the function returned:
--   silence  — event has no CPD groups (correct)
--   missing  — CPD event + no ledger row (told the attendee to see reception)
--   posted   — CPD event + ledger row exists
--
-- Post-Stage B4 F1-F5, walk-ins and pre-plan guests skip with
-- 'registration_unlinked' at check-in, and their check-in-confirm page
-- fell into 'missing' → "see reception". Reception cannot fix any F1-F5
-- gap — the recovery is self-serve (signup → verify → consents → profile →
-- licence → claim → reconcile). Telling the attendee to see reception
-- misleads them.
--
-- New shape:
--   silence  — unchanged
--   pending  — CPD event + no ledger row + the registration is unlinked
--              (user_id null). This is the walk-in / guest waiting-to-claim
--              case; recovery is claim + complete account.
--   missing  — CPD event + no ledger row + user_id is set (setup should
--              be complete but no credit posted — reception is the right
--              recovery route).
--   posted   — unchanged
--
-- Deliberately narrow: 'pending' fires only on user_id NULL. A signed-in
-- user who registered while logged in but still fails F1-F3/F4 also
-- deserves 'pending' rather than 'missing', but detecting that requires
-- duplicating F1-F5 logic in a read function. Deferred until the copy /
-- consumer surface actually differentiates.

create or replace function public.registration_credit_status(
  p_event_id uuid,
  p_registration_code text
) returns text
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_email       text;
  v_user_id_reg uuid;
  v_user_id_auth uuid;
  v_has_groups  boolean;
  v_has_credit  boolean;
begin
  select exists(
    select 1 from public.event_accreditation_groups where event_id = p_event_id
  ) into v_has_groups;
  if not v_has_groups then return 'silence'; end if;

  select email, user_id
    into v_email, v_user_id_reg
    from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  if not found then return 'silence'; end if;

  -- Plan §5.5: registration must be linked to a user for CPD. If it is
  -- not, we are in the walk-in / guest waiting-to-claim state (F5 skip
  -- at award time). Surface as 'pending' so /checkin/confirm can point
  -- the attendee at claim + account setup, not reception.
  if v_user_id_reg is null then return 'pending'; end if;

  -- Registration is linked. If a credit_ledger row exists, we posted.
  if exists (
    select 1 from public.credit_ledger
    where user_id = v_user_id_reg
      and event_id = p_event_id
      and entry_type = 'credit_earned'
  ) then
    return 'posted';
  end if;

  -- Legacy path: pre-plan registrations have user_id null AND may match an
  -- auth.users by email. When user_id_reg is set but no credit exists,
  -- something on F1-F4 (or a technical failure) blocked the award — see
  -- reception is the honest recovery. This branch stays 'missing'.
  return 'missing';
end;
$$;

-- Grant + comment posture unchanged from 20260826020000.
revoke all on function public.registration_credit_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.registration_credit_status(uuid, text)
  to service_role;

comment on function public.registration_credit_status(uuid, text) is
  'Returns silence | pending | missing | posted per plan §5.5 + D4 review. pending fires when the registration is unlinked (walk-in / guest waiting to claim); missing fires when the registration IS linked but no credit_ledger row exists (setup should be complete — see reception).';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname='registration_credit_status';
  if v_def not like '%return ''pending''%' then
    raise exception 'stage-d follow-up: pending return path missing from registration_credit_status';
  end if;
  raise notice 'stage-d follow-up: registration_credit_status pending return in place';
end $$;
