-- Stage B / B3 — profile snapshot builder + claim_registrations_for_user()
--
-- Two functions, both SECURITY DEFINER:
--
--   build_profile_snapshot(p_user_id uuid) -> jsonb
--     Reusable snapshot builder. Same rowsource for both register-while-
--     logged-in (B2, TS side calls via service_role RPC) and the claim
--     definer (B3, SQL side calls inline). Single source of truth so the
--     snapshot shape can never drift between the two paths.
--     Restricted to service_role — never exposed to authenticated, so an
--     authenticated user cannot fetch another user's snapshot by uuid.
--     The claim definer runs as postgres and reaches it via ownership.
--
--   claim_registrations_for_user() -> integer
--     Plan §5.4. Matches unlinked registrations by verified email, sets
--     user_id, writes snapshot ONCE if the row's snapshot is null, and
--     emits one 'registration_claimed' audit_events row per claimed
--     registration. Audit-insert-last per registration (chain advisory
--     lock grabbed once for the whole loop, released at commit).
--
-- The immutability triggers from 20260829100000 pass here because both
-- functions run as postgres inside the definer body (current_user =
-- 'postgres', not in ('authenticated','anon')).

-- ---------------------------------------------------------------------------
-- build_profile_snapshot
-- ---------------------------------------------------------------------------

create or replace function public.build_profile_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Plan §1.4 rule: snapshot is stored only when the user "has a profile".
  -- If there's no professional_profiles row, return null so callers can
  -- skip the snapshot column write. When pp exists, snapshot carries both
  -- users identity fields (full_name / first_name / last_name / salutation)
  -- and pp professional fields + licence summaries in one immutable jsonb.
  select case when pp.user_id is not null then
    jsonb_build_object(
      'full_name',         u.full_name,
      'first_name',        u.first_name,
      'last_name',         u.last_name,
      'salutation',        u.salutation,
      'workplace_text',    pp.workplace_text,
      'position_code',     pp.position_code,
      'position_other',    pp.position_other,
      'profession_code',   pp.profession_code,
      'specialty_code',    pp.specialty_code,
      'licence_summaries', coalesce(
        (select jsonb_agg(jsonb_build_object(
           'body_id',        pl.body_id,
           'licence_number', pl.licence_number,
           'status',         pl.status
         ) order by pl.body_id)
         from public.practitioner_licences pl
         where pl.user_id = p_user_id
           and pl.status in ('declared', 'verified')),
        '[]'::jsonb
      ),
      'snapshotted_at',    now()
    )
  end
  from public.users u
  left join public.professional_profiles pp on pp.user_id = u.id
  where u.id = p_user_id;
$$;

comment on function public.build_profile_snapshot(uuid) is
  'Plan §4.4 snapshot shape. STABLE; called by register-while-logged-in (via service_role RPC) and by claim_registrations_for_user (inline as owner). Not exposed to authenticated — a leak vector by uuid.';

revoke all on function public.build_profile_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.build_profile_snapshot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_registrations_for_user
-- ---------------------------------------------------------------------------

create or replace function public.claim_registrations_for_user()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid;
  v_email    text;
  v_snapshot jsonb;
  v_row      public.registrations%rowtype;
  v_count    integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- Plan §5.4 step 1: caller must have a verified email. Supabase's
  -- email_confirmed_at is the source of truth; unverified callers can
  -- create an auth row but cannot claim registrations.
  select lower(trim(email))
    into v_email
    from auth.users
    where id = v_user_id and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_unverified' using errcode = '42501';
  end if;

  -- Build snapshot once. If the user has no professional_profiles row,
  -- the LEFT JOIN in build_profile_snapshot returns null for those fields;
  -- full_name still lands. Snapshot is written only where the row's
  -- existing snapshot is null (plan §5.4 step 4 — never overwrite).
  v_snapshot := public.build_profile_snapshot(v_user_id);

  -- Grab the chain lock once for the whole batch. write_audit_event is
  -- the sole caller of the chain trigger; N registrations = N audit rows,
  -- all sequenced under this single lock, released at commit (audit-insert-
  -- last still honoured because these audit writes are the last statements
  -- in each loop iteration and the loop runs to completion before RETURN).
  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));

  for v_row in
    select *
      from public.registrations
      where lower(trim(email)) = v_email
        and user_id is null
      for update
  loop
    update public.registrations
       set user_id = v_user_id,
           profile_snapshot = coalesce(profile_snapshot, v_snapshot)
     where id = v_row.id;

    perform public.write_audit_event(
      p_event_type    := 'registration_claimed',
      p_actor_user_id := v_user_id,
      p_actor_role    := 'self',
      p_subject_type  := 'registration',
      p_subject_id    := v_row.id,
      p_payload       := jsonb_build_object(
        'email',            v_email,
        'user_id',          v_user_id,
        'previous_user_id', v_row.user_id
      )
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.claim_registrations_for_user() is
  'Plan §5.4. Links unlinked registrations by verified email; writes snapshot once if null. Emits one registration_claimed audit_events row per claimed registration under the chain advisory lock. Returns the claimed count.';

revoke all on function public.claim_registrations_for_user() from public, anon, authenticated;
grant execute on function public.claim_registrations_for_user() to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: assert both functions exist with the expected grant posture
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'build_profile_snapshot'
  ) then
    raise exception 'stage-b3 self-check: build_profile_snapshot missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_registrations_for_user'
  ) then
    raise exception 'stage-b3 self-check: claim_registrations_for_user missing';
  end if;

  -- build_profile_snapshot MUST NOT be executable by authenticated (leak
  -- vector by uuid). authenticated MUST be able to execute the claim fn.
  if has_function_privilege(
       'authenticated', 'public.build_profile_snapshot(uuid)', 'EXECUTE') then
    raise exception 'stage-b3 self-check: build_profile_snapshot grantable to authenticated (leak vector)';
  end if;

  if not has_function_privilege(
       'authenticated', 'public.claim_registrations_for_user()', 'EXECUTE') then
    raise exception 'stage-b3 self-check: claim_registrations_for_user not grantable to authenticated';
  end if;

  raise notice 'stage-b3 self-check: all assertions passed';
end $$;
