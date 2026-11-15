-- H1, SQL layer (security audit 2026-11-04; kernel K1 change, Ivan's sign-off 2026-11-07, Decisions Log Q52).
-- app_private.auth_email() returned the JWT email claim as-is. Every staff gate (require_active_staff,
-- is_eventar_staff, the staff RLS policies, ~10 definer functions) matches that string to public.staff.email, so
-- identity was an unverified email string. If an auth account can exist for a provisioned staff address without
-- the mailbox being confirmed (hosted Confirm email OFF, or a future config drift), its holder gets that staff
-- row's powers through any JWT, bypassing the app-layer guard in requireStaff / proxy.ts.
--
-- The claim is now returned only when it belongs to a confirmed account: the token's sub must be the id of an
-- auth.users row whose email matches the claim (case-insensitive) and whose email_confirmed_at is set. Anything
-- else, including a claim with no account behind it, resolves to '' (no staff row matches ''). Every caller keeps
-- its own signature and semantics; only the unconfirmed or unbacked case changes. service_role and definer-only
-- paths carry no email claim and already resolved to ''.
-- STABLE is kept: one primary-key lookup per call.

create or replace function app_private.auth_email()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when exists (
      select 1
        from auth.users u
       where u.id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
         and u.email_confirmed_at is not null
         and lower(u.email) = lower(current_setting('request.jwt.claims', true)::jsonb ->> 'email')
    ) then current_setting('request.jwt.claims', true)::jsonb ->> 'email'
    else ''
  end
$$;

do $$
begin
  if app_private.auth_email() <> '' then
    raise exception 'auth_email: resolves with no JWT claims';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app_private' and p.proname = 'auth_email' and p.prosecdef
  ) then
    raise exception 'auth_email: lost SECURITY DEFINER';
  end if;
  if not has_function_privilege('authenticated', 'app_private.auth_email()', 'EXECUTE') then
    raise exception 'auth_email: authenticated lost EXECUTE (staff RLS policies call it)';
  end if;
end $$;
