-- 2026-08-14 full-stack review — grant hygiene, same class as
-- 20260716233440_grant_hygiene_residual_public.
--
-- set_event_organisation() (the BEFORE INSERT trigger on public.events that
-- derives organisation_id server-side, closing the DEFERRED-57 self-org-patch
-- hole) has carried a bare PUBLIC + explicit anon/authenticated/service_role
-- EXECUTE grant since it was created (20260804030000). It has never been
-- reachable — Postgres refuses to call a trigger function outside trigger
-- context ("trigger functions can only be called as triggers") — but every
-- other definer function in this schema has had its grant explicitly closed,
-- and an unexamined bare-PUBLIC grant is exactly the class of gap this repo
-- has been bitten by four times before (see CLAUDE.md Hard Rule 11 history).
--
-- Verified safe before writing this migration (local stack, rolled-back
-- transaction): revoking EXECUTE does not stop the trigger firing at INSERT
-- time, and a direct `select set_event_organisation()` call fails with
-- "trigger functions can only be called as triggers" both before and after
-- the revoke — the function was never callable via PostgREST RPC regardless
-- of its grant. This migration removes a latent footgun, not a live hole.
revoke execute on function public.set_event_organisation()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertion: the trigger must still fire after the revoke.
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff_id uuid;
  v_event_id uuid;
  v_org_id   uuid;
begin
  select id into v_staff_id from public.staff limit 1;
  if v_staff_id is null then
    raise notice 'set_event_organisation self-check skipped: no staff row to attribute a probe event to (expected on a bare/never-seeded database)';
    return;
  end if;

  insert into public.events (
    title, start_time, end_time, timezone, venue_name, city, country,
    latitude, longitude, created_by
  ) values (
    '__grant_hygiene_probe__', now() + interval '1 day', now() + interval '1 day 1 hour',
    'Asia/Hong_Kong', 'v', 'Hong Kong', 'HK', 22.3, 114.17, v_staff_id
  ) returning id, organisation_id into v_event_id, v_org_id;

  if v_org_id is null then
    raise exception 'set_event_organisation: trigger did not fire after the grant revoke — organisation_id is NULL';
  end if;

  delete from public.events where id = v_event_id;

  if has_function_privilege('anon', 'public.set_event_organisation()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_event_organisation()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.set_event_organisation()', 'EXECUTE') then
    raise exception 'set_event_organisation: EXECUTE grant was not actually revoked';
  end if;
end $$;

-- Rollback:
--   grant execute on function public.set_event_organisation()
--     to public, anon, authenticated, service_role;
