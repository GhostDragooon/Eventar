-- CPD Sprint 3a / Task 2 follow-up, part 2 — code-quality review of
-- 20260709140000 found the same bug class it fixed still present in two
-- more places that don't call app_private.require_active_staff(...), so
-- weren't caught by that search: app_private.is_manager() (the sole
-- cross-owner-read gate on 5+ RLS policies — agenda_blocks, events,
-- registrations, survey_responses, speaker_checkins, staff_self_read) and
-- public.pseudonymise_user (GDPR/PDPO erasure). Both hardcoded role =
-- 'manager' / role in ('manager','eventar_staff'), permanently
-- unsatisfiable after 20260709130000's CHECK widen — this was a LIVE
-- regression, not a future-Sprint-3b one: the sole staff account
-- (already remapped to eventar_staff) had already lost RLS cross-owner
-- read on all five tables the moment 20260709130000 applied, since no
-- separate eventar_staff-only policy exists on those tables (only
-- is_manager() gates cross-owner read there).
--
-- Mapping: is_manager() -> ('organiser_admin','eventar_staff') (its
-- original semantic never included plain 'organizer'; 'eventar_staff'
-- added because no other policy on these 5 tables grants it cross-owner
-- read). pseudonymise_user -> ('organiser_admin','eventar_staff'),
-- consistent with transition_dsr's already-approved admin-tier-only
-- mapping (20260709140000) — same compliance-sensitive-action class.

create or replace function app_private.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and role in ('organiser_admin','eventar_staff') and status = 'active'
   ) $$;

create or replace function public.pseudonymise_user(p_user_id uuid, p_reason text)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor_staff public.staff%rowtype;
  pseudonym   text;
begin
  select * into actor_staff
  from public.staff
  where email = app_private.auth_email()
    and role in ('organiser_admin','eventar_staff')
    and status = 'active'
  order by created_at limit 1;

  if actor_staff.id is null then
    raise exception 'pseudonymise_user: caller is not active staff'
      using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'pseudonymise_user: reason is required';
  end if;

  pseudonym := 'ERASED-' || encode(extensions.gen_random_bytes(6), 'hex');

  update public.users
     set full_name = pseudonym,
         pseudonymised_at = now(),
         deleted_at = now()
   where id = p_user_id
     and pseudonymised_at is null;

  if not found then
    raise exception
      'pseudonymise_user: user % not found or already pseudonymised',
      p_user_id;
  end if;

  -- LAST statement before return: audit write (same transaction).
  perform public.write_audit_event(
    'user_pseudonymised',
    auth.uid(),
    actor_staff.role,
    actor_staff.organisation_id,
    'user',
    p_user_id,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;
