-- Cross-tenant erasure and DSR authority (found 2026-10-09; decided by Ivan 2026-10-10).
--
-- THE BUG. pseudonymise_user(p_user_id, p_reason) and transition_dsr(p_id, p_status, p_notes)
-- are SECURITY DEFINER, executable by `authenticated`, and were gated by ROLE only
-- ('organiser_admin' or 'eventar_staff') with no relation between the caller and the target.
-- The same role-only reach sat on the table: dsr_staff_all was an ALL policy on
-- is_manager() OR is_eventar_staff(), and is_manager() has no organisation test, while
-- `authenticated` held full DML on the table. Executed on the local stack as org A's
-- organiser_admin JWT, with no tie to the victims:
--   * pseudonymise_user overwrote an unrelated attendee's name with ERASED-... (the original
--     name is lost);
--   * transition_dsr moved another subject's erasure request;
--   * a direct PATCH and a direct DELETE on data_subject_requests did the same with NO audit
--     event;
--   * a direct UPDATE on public.users matched 0 rows, so for erasure the function is the only
--     write path.
-- Origin: the Sprint-1 design was an eventar_staff-only gate (BASELINE-DELTAS.md); the shipped
-- gate was ('manager','eventar_staff'), where `manager` was the single-organisation admin, and
-- the 2026-07-09 role remap translated `manager` to `organiser_admin` one-to-one. The
-- multi-tenant pivot (Q20) never revisited it.
--
-- THE DECISIONS (Ivan, 2026-10-10; vault Decisions Log Q42).
-- 1. ERASURE IS PLATFORM-ONLY. pseudonymise_user requires an active eventar_staff, as the
--    Sprint-1 design intended. Ivan first chose to org-scope it and reversed that after review:
--    (a) an organisation can manufacture the link that would authorise it. Anyone, staff
--        included, can register a person's email as a guest at a published event, and when
--        that person presses "Claim past events" the guest row is linked to their account
--        (executed end to end);
--    (b) the effect lands on the shared identity row: users.full_name feeds every
--        organisation's college export.
-- 2. DSR PROCESSING IS ORGANISATION-SCOPED. transition_dsr and reading the table: an
--    organiser_admin only for a person with an account-linked registration
--    (registrations.user_id) at an event of the admin's own organisation; eventar_staff for
--    anyone. The refusal is identical for an unrelated and an unknown id and is raised before
--    the subject is looked up, so it reveals nothing about who exists. Because an organiser_admin
--    cannot erase, only platform staff can COMPLETE or REJECT an erasure request; an organiser_admin
--    can keep it moving (in_progress) or hand it on (escalated). Otherwise the record could say
--    "erased" when nothing was.
-- 3. APP ROLES CANNOT WRITE THE TABLE (Hard Rule 11). transition_dsr, which audits, is the only
--    way an app role changes a request. The only direct INSERT is a person filing their own
--    request, limited to the three columns a person chooses (the rest are defaults), so nobody
--    can file a request that is already completed or stamped with an operator's staff id.
--    dsr_staff_all (ALL) becomes dsr_staff_read (SELECT). service_role keeps DML for the future
--    console.
--
-- One helper answers "which staff row authorises this caller to process this subject's
-- requests?", so transition_dsr and the SELECT policy cannot drift apart. It returns the row the
-- authority comes from, so the audit event names the organisation the action was authorised
-- under (a person who is organiser_admin in two organisations is not attributed to whichever row
-- happens to be oldest). A subject whose only registrations are guest rows (user_id null) is not
-- related; erasing or processing needs the person to have linked the registration themselves.
--
-- KNOWN LIMITS, NOT FIXED HERE (docs/plans/handoff_20261010-dsr-org-scope.md has the detail):
--   * "Erasure" is shallow: only users.full_name, pseudonymised_at and deleted_at change. The
--     sign-in, the auth email, first/last name, phone, avatar, profile, licences and
--     registrations remain. The COMMENT on the function says so.
--   * The link in (2) is also manufacturable, so DSR-processing authority can be too. The
--     stakes are lower (a request record, with an audit event) and fixing it means changing the
--     claim contract.
--   * The cross-tenant READ policies that use is_manager() (users, audit_events, staff,
--     consent_records, professional_profiles, society_memberships, additional_appointments).
--   * service_role cannot call either function (no EXECUTE on one, no JWT email for the other),
--     so the console will need an actor parameter or must forward the user's JWT.
--
-- Re-runnable. CREATE OR REPLACE keeps each function's ACL; the assertions at the end re-check
-- the ACLs, the policy and the grants against the catalog. supabase/seed.sql re-asserts the table
-- grants on every `supabase db reset` (it blanket-grants first), so keep the two in step.

create or replace function app_private.staff_for_subject(p_subject uuid)
returns public.staff
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select s.*
    from public.staff s
   where s.email = app_private.auth_email()
     and s.status = 'active'
     and (
          s.role = 'eventar_staff'
       or (s.role = 'organiser_admin'
           and exists (
             select 1
               from public.registrations r
               join public.events e on e.id = r.event_id
              where r.user_id = p_subject
                and e.organisation_id = s.organisation_id))
     )
   order by (s.role = 'eventar_staff') desc, s.created_at, s.id
   limit 1
$$;

comment on function app_private.staff_for_subject(uuid) is
  'The active staff row that authorises the caller (by JWT email) to process data subject p_subject''s requests: eventar_staff for anyone, or an organiser_admin of an organisation with an account-linked registration (registrations.user_id) for them. NULL when none. Used by transition_dsr and the dsr_staff_read policy. Erasure does not use it: pseudonymise_user is platform-only.';

-- Only the dsr_staff_read policy (evaluated as the caller) needs EXECUTE; the definers run as
-- the owner. app_private is not exposed through PostgREST.
revoke all on function app_private.staff_for_subject(uuid) from public, anon;
grant execute on function app_private.staff_for_subject(uuid) to authenticated;

create or replace function public.pseudonymise_user(p_user_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor_staff public.staff%rowtype;
  pseudonym   text;
begin
  -- Gate: an ACTIVE platform operator only, checked before the subject is looked up so the
  -- refusal reveals nothing about it.
  select * into actor_staff
  from public.staff
  where email = app_private.auth_email()
    and role = 'eventar_staff'
    and status = 'active'
  order by created_at, id limit 1;

  if actor_staff.id is null then
    raise exception 'pseudonymise_user: only active platform staff (eventar_staff) can run an erasure; escalate the request (transition_dsr, status escalated) or contact the platform operator'
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
$function$;

comment on function public.pseudonymise_user(uuid, text) is
  'Platform staff only. Pseudonymises a person''s profile name; not a full erasure.

Active eventar_staff only. Renames the profile and stamps two flags, and writes an audit event; the rest of what Eventar holds about the person is unchanged, so a 204 is not proof of erasure. See docs/ops/erasure-and-dsr.md. A refusal raises 42501.';

create or replace function public.transition_dsr(p_id uuid, p_status text, p_notes text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor     public.staff%rowtype;
  v_subject uuid;
  v_type    text;
begin
  -- Gate (42501 otherwise): the staff row that authorises acting on THIS request's subject.
  -- An unknown request id has no subject and is refused like an unrelated one.
  select d.subject_user_id, d.request_type into v_subject, v_type from public.data_subject_requests d where d.id = p_id;
  actor := app_private.staff_for_subject(v_subject);
  if actor.id is null then
    raise exception 'transition_dsr: not permitted. Active platform staff can process any request; an active organisation admin only for a person with an account-linked registration at one of the organisation''s events'
      using errcode = '42501';
  end if;

  if p_status not in ('pending','in_progress','completed','rejected','escalated') then
    raise exception 'transition_dsr: invalid status %', p_status;
  end if;

  -- Only platform staff can erase, so only platform staff can say an erasure request is done or
  -- refused. Reachable only by a caller who already passed the gate above, so it reveals nothing.
  if v_type = 'erasure' and p_status in ('completed', 'rejected') and actor.role <> 'eventar_staff' then
    raise exception 'transition_dsr: only platform staff can complete or reject an erasure request; set it to escalated to hand it on'
      using errcode = '42501';
  end if;

  -- Bound to the subject the gate was decided on, so a request re-pointed between the check and
  -- the write is not transitioned under the wrong authority (0 rows falls into "not found").
  update public.data_subject_requests
     set status = p_status,
         resolver_staff_id = actor.id,
         resolution_notes = coalesce(p_notes, resolution_notes),
         resolved_at = case when p_status in ('completed','rejected') then now() else resolved_at end
   where id = p_id
     and subject_user_id = v_subject;
  if not found then
    raise exception 'transition_dsr: request % not found', p_id;
  end if;

  perform public.write_audit_event(
    'dsr_transitioned', auth.uid(), actor.role, actor.organisation_id,
    'data_subject_request', p_id,
    jsonb_build_object('status', p_status)
  );
end;
$function$;

comment on function public.transition_dsr(uuid, text, text) is
  'Moves a data subject request to a new status and records who did it.

p_status is one of pending, in_progress, completed, rejected, escalated. Active platform staff can process any request; an active organiser_admin only the requests of a person linked to their organisation, and only platform staff can complete or reject an erasure request (an organiser_admin can set it to escalated). Writes an audit event with the new status. A refusal raises 42501. See docs/ops/erasure-and-dsr.md.';

-- The table. Staff may READ requests of their organisation's subjects (eventar_staff: all).
-- dsr_self_create / dsr_self_read (a person's own access) are separate policies, unchanged.
drop policy if exists dsr_staff_all on public.data_subject_requests;
drop policy if exists dsr_staff_read on public.data_subject_requests;
create policy dsr_staff_read on public.data_subject_requests
  for select to authenticated
  using ((app_private.staff_for_subject(subject_user_id)).id is not null);

-- Grant level (RLS alone was not enough here: a linked admin passed it, and the table grants let
-- everything else through). Table-level first: a column-level REVOKE no-ops against a table-level grant.
revoke insert, update, delete on public.data_subject_requests from public, anon, authenticated;
grant insert (subject_user_id, request_type, request_notes) on public.data_subject_requests to authenticated;

-- PostgREST answers a denied write with a hint to "GRANT INSERT ON public.data_subject_requests TO
-- authenticated", which would defeat the column limit above. Say so where a developer will look.
comment on table public.data_subject_requests is
  'Data subject requests. App roles cannot write this table: staff read it through dsr_staff_read, a person may file their own request (subject_user_id, request_type and request_notes only), and every change goes through transition_dsr. Do NOT grant table-level INSERT, UPDATE or DELETE to anon or authenticated, whatever a permission-denied hint suggests (migration 20261010000725).';

do $$
declare
  tbl constant text := 'public.data_subject_requests';
  col text;
begin
  -- The helper: a pinned SECURITY DEFINER, executable by authenticated only.
  if not (select p.prosecdef from pg_proc p where p.oid = 'app_private.staff_for_subject(uuid)'::regprocedure) then
    raise exception 'staff_for_subject is not SECURITY DEFINER';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'app_private.staff_for_subject(uuid)'::regprocedure
                  and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) then
    raise exception 'staff_for_subject has no pinned search_path';
  end if;
  if has_function_privilege('anon', 'app_private.staff_for_subject(uuid)', 'EXECUTE') then
    raise exception 'staff_for_subject is EXECUTE-able by anon';
  end if;
  if not has_function_privilege('authenticated', 'app_private.staff_for_subject(uuid)', 'EXECUTE') then
    raise exception 'staff_for_subject lost authenticated EXECUTE: dsr_staff_read would fail for every staff reader';
  end if;

  -- The two functions keep their grants: the gate is in the body.
  if has_function_privilege('anon', 'public.pseudonymise_user(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.transition_dsr(uuid,text,text)', 'EXECUTE') then
    raise exception 'a DSR function is EXECUTE-able by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.pseudonymise_user(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.transition_dsr(uuid,text,text)', 'EXECUTE') then
    raise exception 'a DSR function lost authenticated EXECUTE';
  end if;

  -- Policies: the role-only ALL policy is gone; staff read goes through the helper.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'data_subject_requests' and policyname = 'dsr_staff_all') then
    raise exception 'dsr_staff_all still exists';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'data_subject_requests' and policyname = 'dsr_staff_read'
       and cmd = 'SELECT' and roles = '{authenticated}'
       and qual ~ 'staff_for_subject' and qual !~ 'is_manager|is_eventar_staff'
  ) then
    raise exception 'dsr_staff_read is missing or not keyed on staff_for_subject';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'data_subject_requests'
        and policyname in ('dsr_self_create', 'dsr_self_read')) <> 2 then
    raise exception 'the data subject''s own dsr_self_* policies are not both present';
  end if;

  -- Grants: no app role can UPDATE or DELETE; a person can INSERT only the three columns they choose.
  foreach col in array array['id','subject_user_id','request_type','status','submitted_at','due_at','resolved_at','resolver_staff_id','request_notes','resolution_notes'] loop
    if has_column_privilege('authenticated', tbl, col, 'UPDATE') or has_column_privilege('anon', tbl, col, 'UPDATE') then
      raise exception 'an app role can still UPDATE %.%', tbl, col;
    end if;
    if has_column_privilege('anon', tbl, col, 'INSERT') then
      raise exception 'anon can still INSERT %.%', tbl, col;
    end if;
    if has_column_privilege('authenticated', tbl, col, 'INSERT') <> (col in ('subject_user_id','request_type','request_notes')) then
      raise exception 'authenticated INSERT on %.% is not as intended', tbl, col;
    end if;
  end loop;
  if has_table_privilege('authenticated', tbl, 'DELETE') or has_table_privilege('anon', tbl, 'DELETE') then
    raise exception 'an app role can still DELETE from %', tbl;
  end if;
  if not (has_table_privilege('service_role', tbl, 'INSERT') and has_table_privilege('service_role', tbl, 'UPDATE')
          and has_table_privilege('service_role', tbl, 'DELETE')) then
    raise exception 'service_role lost DML on % (the console path)', tbl;
  end if;
end $$;
