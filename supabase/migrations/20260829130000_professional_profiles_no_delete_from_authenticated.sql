-- Stage D / follow-up — close the DELETE grant on professional_profiles.
--
-- Plan §8.1 explicitly names the surface as "self read/update", not
-- read/update/delete. 20260829020000 tried to close DELETE with
-- `revoke all on public.professional_profiles from anon, public;` but
-- Supabase's seed.sql grants back DML across tables that are not on the
-- Hard Rule 11 audited-mutation matrix (memory: eventar-local-stack-cli-
-- 2109-grants), so authenticated ended up with DELETE regardless. This
-- migration is the explicit revoke that stays clean across db reset.
--
-- Profile removal happens only via pseudonymise_user or a future DSR
-- definer — never as an ordinary user-facing action.

revoke delete on public.professional_profiles from public, anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.professional_profiles', 'DELETE') then
    raise exception 'stage-d follow-up: authenticated still has DELETE on professional_profiles';
  end if;
  if has_table_privilege('anon', 'public.professional_profiles', 'DELETE') then
    raise exception 'stage-d follow-up: anon still has DELETE on professional_profiles';
  end if;
  -- service_role retains DELETE — needed for pseudonymise_user and DSR
  -- workflows that will land in a future slice.
  if not has_table_privilege('service_role', 'public.professional_profiles', 'DELETE') then
    raise exception 'stage-d follow-up: service_role lost DELETE (DSR/pseudonymise path would break)';
  end if;
  raise notice 'stage-d follow-up: professional_profiles DELETE grants tightened';
end $$;
