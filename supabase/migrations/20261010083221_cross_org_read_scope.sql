-- Cross-tenant READ scope: people, audit log and staff directory
-- (found 2026-10-10; decided by Ivan 2026-10-10; vault Decisions Log Q43).
--
-- THE BUG. app_private.is_manager() is `role in ('organiser_admin','eventar_staff') and
-- status = 'active'` with NO organisation test (the single-organisation helper, translated
-- one-to-one by the 2026-07-09 role remap). Seven SELECT policies were built on it, so ANY
-- organisation's active organiser_admin read EVERY row of public.users (names, phones),
-- audit_events, staff (including the platform operators), consent_records, professional_profiles,
-- society_memberships and additional_appointments. Executed on the local stack on 2026-10-10 as
-- an org-A admin with no data of their own: users 180/180, audit_events 6,665/6,665, staff 62/62,
-- consent_records 149/149, professional_profiles 75/75. Nothing in the app reads these through a
-- user session except /settings/team (staff): rosters and the Participants page read names from
-- registrations, and the college export uses the service-role client.
--
-- THE DECISIONS (Ivan, 2026-10-10).
-- 1. users, consent_records, professional_profiles, society_memberships, additional_appointments
--    and audit_events: the platform operator (eventar_staff) only, plus the person themself where a
--    *_self_read policy exists (untouched). These rows are shared identity or tenant-less (about
--    half the audit rows have no organisation_id), and the only tenant link, a registration, can be
--    manufactured by the organisation (Q42). An organisation that later needs one gets a
--    column-limited function, not a wider policy.
-- 2. staff: the caller's own row, the operator, and an ACTIVE organiser_admin of THAT ROW'S
--    organisation (app_private.is_org_admin), but never an eventar_staff row: platform staff are
--    not tenant staff, so where the operator's row sits (the first-operator bootstrap in
--    supabase/seed.sql puts it in `default`, next to tenant admins) cannot expose it. Row-aware on
--    purpose: staff is UNIQUE
--    (email, organisation_id), so one person can be admin of A and only a member of B, and
--    current_staff_org_id() (the caller's first organisation) would get that wrong. Members,
--    body_admins and auditors keep what they had: their own row.
-- 3. app_private.is_manager() is DROPPED, with no CASCADE: a hosted dependent that no migration
--    here knows about must fail the push, not vanish. This needs 20261010000725 first (it drops
--    dsr_staff_all, the other policy that used is_manager()); a database without it fails the DROP
--    below and applies nothing. A full `db push` applies them in timestamp order.
--
-- Re-runnable. Local only until Ivan's own `supabase db push --linked`.

-- The row-aware helper. Same shape as is_org_member(uuid): definer, pinned search_path, keyed on the
-- JWT email. EXECUTE goes to the roles that evaluate staff_self_read (it applies to PUBLIC, so anon
-- runs it too and must not get "permission denied for function"), and not to PUBLIC.
create or replace function app_private.is_org_admin(p_org_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.staff
     where email = app_private.auth_email()
       and organisation_id = p_org_id
       and role = 'organiser_admin'
       and status = 'active'
  )
$$;

revoke all on function app_private.is_org_admin(uuid) from public;
grant execute on function app_private.is_org_admin(uuid) to anon, authenticated, service_role;

comment on function app_private.is_org_admin(uuid) is
  'True when the caller (by JWT email) is an ACTIVE organiser_admin of organisation p_org_id. Row-aware: staff is UNIQUE (email, organisation_id), so a person can be admin of one organisation and a member of another. Use this, never a role-only check, in any policy that exposes tenant data. The platform operator is separate: app_private.is_eventar_staff().';

-- ALTER POLICY keeps each policy's command and roles and errors if the policy is missing (drift).
-- ponytail: is_org_admin runs once per staff row, like is_org_member in the registrations
-- policies; switch to a set-returning helper evaluated once per statement if staff reaches many
-- thousands of rows. The zero-argument operator check is wrapped in a sub-select so Postgres
-- evaluates it once per statement instead of once per row.
alter policy staff_self_read on public.staff
  using (
    email = app_private.auth_email()
    or (select app_private.is_eventar_staff())
    or (role <> 'eventar_staff' and app_private.is_org_admin(organisation_id))
  );
alter policy users_staff_read on public.users
  using ((select app_private.is_eventar_staff()));
alter policy audit_events_staff_read on public.audit_events
  using ((select app_private.is_eventar_staff()));
alter policy consent_staff_read on public.consent_records
  using ((select app_private.is_eventar_staff()));
alter policy professional_profiles_staff_read on public.professional_profiles
  using ((select app_private.is_eventar_staff()));
alter policy society_memberships_staff_read on public.society_memberships
  using ((select app_private.is_eventar_staff()));
alter policy additional_appointments_staff_read on public.additional_appointments
  using ((select app_private.is_eventar_staff()));

comment on policy users_staff_read on public.users is
  'Platform operator (eventar_staff) only. The person reads their own row through users_self_read. Organisation admins have no read here (migration 20261010083221, Decisions Log Q43). To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy audit_events_staff_read on public.audit_events is
  'Platform operator (eventar_staff) only. Organisation admins have no read of the audit log through a user session (Q43); many rows carry no organisation at all. To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy consent_staff_read on public.consent_records is
  'Platform operator (eventar_staff) only. The person reads their own rows through consent_self_read (Q43). To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy professional_profiles_staff_read on public.professional_profiles is
  'Platform operator (eventar_staff) only. The person reads their own row through professional_profiles_self_read (Q43). To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy society_memberships_staff_read on public.society_memberships is
  'Platform operator (eventar_staff) only. The person reads their own rows through society_memberships_self_read (Q43). To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy additional_appointments_staff_read on public.additional_appointments is
  'Platform operator (eventar_staff) only. The person reads their own rows through additional_appointments_self_read (Q43). To give an organisation a read, add a service_role-only column-limited function (docs/DEFERRED.md); do not widen this policy.';
comment on policy staff_self_read on public.staff is
  'Own row, the platform operator, or an active organiser_admin of the row''s organisation (app_private.is_org_admin), never for an eventar_staff row. Members, body_admins and auditors read only their own row (Q43).';

-- Nothing depends on the role-only helper any more. No CASCADE: a hidden dependent must fail this
-- migration, not disappear with it.
drop function if exists app_private.is_manager();

-- Checks for the one environment this file cannot see: a hosted database that differs from local.
-- (What the statements above just did is not re-asserted; the RLS suite covers it.)
do $$
declare
  v_bad text;
begin
  -- DROP FUNCTION cannot see a function body that calls is_manager(); it would fail at run time.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~* 'is_manager\s*\(' and n.nspname not in ('pg_catalog', 'information_schema');
  if v_bad is not null then
    raise exception 'function bodies still call the dropped is_manager(): %', v_bad;
  end if;

  -- A policy that exists only on the hosted database could keep these tables readable to tenants
  -- while this migration reports success. Only these SELECT policies may exist on them.
  select string_agg(tablename || '/' || policyname, ', ') into v_bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('users', 'audit_events', 'staff', 'consent_records', 'professional_profiles',
                       'society_memberships', 'additional_appointments')
     and cmd in ('SELECT', 'ALL')
     and policyname not in ('users_self_read', 'users_staff_read',
                            'audit_events_staff_read', 'audit_events_writer_select',
                            'staff_self_read',
                            'consent_self_read', 'consent_staff_read',
                            'professional_profiles_self_read', 'professional_profiles_staff_read',
                            'society_memberships_self_read', 'society_memberships_staff_read',
                            'additional_appointments_self_read', 'additional_appointments_staff_read');
  if v_bad is not null then
    raise exception 'unexpected readable policies on tenant-scoped tables (hosted drift?): %', v_bad;
  end if;
end $$;
