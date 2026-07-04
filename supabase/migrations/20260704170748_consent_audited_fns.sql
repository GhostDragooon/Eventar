-- CPD Sprint 2 / §1+§3 R-C — consent capture as an audited, atomic Server
-- Action (NOT in handle_new_user: the audit write holds the chain advisory
-- lock to commit; embedding it in the signup trigger serialises signups —
-- see design P2). Actor is the user themselves.
create function public.grant_consent(p_consent_type text, p_version text)
returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'grant_consent: no authenticated user' using errcode = '42501';
  end if;
  if p_consent_type not in ('terms_of_service','privacy_policy','ai_processing_notice','marketing') then
    raise exception 'grant_consent: unknown consent_type %', p_consent_type;
  end if;
  if p_version is null or trim(p_version) = '' then
    raise exception 'grant_consent: version is required';
  end if;

  insert into public.consent_records (user_id, consent_type, version)
  values (v_uid, p_consent_type, p_version)
  returning id into v_id;

  -- LAST statement: audit write (same transaction). Anonymous-actor columns
  -- are nullable; here actor IS the user.
  perform public.write_audit_event(
    'consent_granted', v_uid, 'self', null, 'consent', v_id,
    jsonb_build_object('consent_type', p_consent_type, 'version', p_version)
  );
  return v_id;
end;
$$;
-- D1 lesson (found live in Task 3): CREATE FUNCTION implicitly grants
-- EXECUTE to PUBLIC, which authenticated/anon inherit regardless of any
-- explicit per-role grant below. Revoke it explicitly, or a later
-- "restrict this grant" migration is a no-op. Also revoke anon explicitly
-- (belt-and-suspenders — the auth.uid() check already rejects anon, since
-- an unauthenticated caller has no uid, but don't rely on that alone).
revoke execute on function public.grant_consent(text, text) from public, anon;
grant execute on function public.grant_consent(text, text) to authenticated, service_role;

create function public.withdraw_consent(p_consent_id uuid)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'withdraw_consent: no authenticated user' using errcode = '42501';
  end if;
  update public.consent_records
     set withdrawn_at = now()
   where id = p_consent_id and user_id = v_uid and withdrawn_at is null;
  if not found then
    raise exception 'withdraw_consent: consent % not found for caller or already withdrawn', p_consent_id;
  end if;
  perform public.write_audit_event(
    'consent_withdrawn', v_uid, 'self', null, 'consent', p_consent_id, '{}'::jsonb
  );
end;
$$;
revoke execute on function public.withdraw_consent(uuid) from public, anon;
grant execute on function public.withdraw_consent(uuid) to authenticated, service_role;
