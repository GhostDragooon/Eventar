-- CPD Sprint 5 / user-lens CRITICAL follow-up — RSC-side reader for the
-- attendee's post-check-in credit banner on /checkin/confirm.
--
-- Why a definer: user-lens found the client-side ok-state banner in
-- ConfirmButton never got a paint frame — `revalidatePath('/checkin/confirm')`
-- swaps PassView → CheckedInView in the same React 19 transition that the
-- client `setState({kind:'ok', credit})` runs in, so the parent tree replaces
-- before the child paints. Fix: render the banner in CheckedInView (the RSC)
-- with a `posted` / `missing` / `silence` status queried at render time.
--
-- The resolution needs auth.users.email (public.registrations carries email
-- only; public.users has no email column). PostgREST exposes `public,
-- graphql_public` only (supabase/config.toml `[api].schemas`), so
-- `admin.schema('auth').from('users')` cannot reach it from the RSC. A
-- one-shot definer that returns the classification directly is the smallest
-- surface — smaller than piping email out to app code and re-querying.
--
-- Read-only. Returns text with three shapes:
--   'posted'   at least one credit_earned row exists for this attendee/event.
--   'missing'  the event carries CPD accreditation groups but no such row
--              exists (real signal — attendee should see reception).
--   'silence'  event has no groups (non-CPD), or the code doesn't resolve to
--              a registration on this event (a stray /checkin/confirm hit —
--              CheckedInView itself already handles code validity upstream).
--
-- The classification mirrors summariseCreditForAttendee() in
-- app/(public)/checkin/confirm/actions.ts — deliberately not sharing code
-- (client-side vs DB-side), same rules. Keep in sync on future changes.

create or replace function public.registration_credit_status(
  p_event_id uuid,
  p_registration_code text
) returns text
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_email       text;
  v_user_id     uuid;
  v_has_groups  boolean;
  v_has_credit  boolean;
begin
  -- No CPD groups on the event → 'silence'. The attendee did not expect
  -- CPD credit; a banner would be noise.
  select exists(
    select 1 from public.event_accreditation_groups where event_id = p_event_id
  ) into v_has_groups;
  if not v_has_groups then return 'silence'; end if;

  select email into v_email from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  -- Registration not found: the RSC will already have shown "Code not
  -- recognised" upstream, so this branch is unreachable in practice — but
  -- returning 'silence' rather than 'missing' keeps a hostile /checkin/confirm
  -- crafted with a valid-code-for-a-different-event from surfacing a
  -- misleading "credit missing" banner if the path is ever reached.
  if not found then return 'silence'; end if;

  select id into v_user_id from auth.users
    where lower(email) = lower(trim(v_email)) limit 1;
  -- A verified-attended registration without an auth.users row is what
  -- award_attendance_credit returns as 'skipped:no_user' — a real reason to
  -- see reception, not silence.
  if v_user_id is null then return 'missing'; end if;

  select exists(
    select 1 from public.credit_ledger
    where user_id = v_user_id
      and event_id = p_event_id
      and entry_type = 'credit_earned'
  ) into v_has_credit;

  return case when v_has_credit then 'posted' else 'missing' end;
end;
$$;

-- Definer function, called from the RSC via the service_role client — anon
-- and authenticated have no need for it (the anon-facing /checkin/confirm
-- runs everything server-side).
revoke all on function public.registration_credit_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.registration_credit_status(uuid, text)
  to service_role;
