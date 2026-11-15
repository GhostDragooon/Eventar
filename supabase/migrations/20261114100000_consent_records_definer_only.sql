-- M2 (security audit 2026-11-04): consent_records was writable and forgeable by any signed-in user.
-- authenticated held INSERT/UPDATE/DELETE and two self-write policies only checked user_id = auth.uid(), so a
-- person could insert a row with version 'forged' and granted_at 1999, or rewrite their own granted_at,
-- withdrawn_at, version and consent_type. A consent row is evidence of what a person agreed to and when.
--
-- grant_consent / withdraw_consent (SECURITY DEFINER, audited, 20260704170748) are the only write paths the
-- app uses (app/account/complete/actions.ts). They run as the table owner, so this revoke does not touch them.
-- Hard Rule 11 lifecycle pattern: INSERT/UPDATE revoked from every API role including service_role (BYPASSRLS
-- means only the grant blocks it); service_role keeps DELETE for erasure and test teardown, as on
-- practitioner_licences. SELECT is untouched: consent_self_read and consent_staff_read stay.

drop policy if exists consent_self_insert on public.consent_records;
drop policy if exists consent_self_withdraw on public.consent_records;

revoke insert, update, delete on public.consent_records from public, anon, authenticated, service_role;
grant delete on public.consent_records to service_role;

do $$
declare
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.consent_records', p) then
        raise exception 'consent_records: % still holds % after revoke', r, p;
      end if;
    end loop;
  end loop;
  foreach p in array array['INSERT', 'UPDATE'] loop
    if has_table_privilege('service_role', 'public.consent_records', p) then
      raise exception 'consent_records: service_role still holds % after revoke', p;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.consent_records', 'DELETE') then
    raise exception 'consent_records: service_role lost DELETE (erasure and teardown need it)';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'consent_records' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'consent_records: a write policy survived';
  end if;
end $$;
