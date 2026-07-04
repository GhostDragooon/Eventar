-- CPD Sprint 2 / §4 — record an automatic session revocation. The signOut
-- itself happens in the app layer (admin API — no SQL equivalent); this
-- function only appends the tamper-evident audit fact, LAST + atomic.
create function public.record_session_revocation(
  p_user_id uuid, p_reason text, p_scope text default 'global'
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_id uuid;
begin
  select public.write_audit_event(
    'session_revoked', null, 'system', null, 'user', p_user_id,
    jsonb_build_object('reason', p_reason, 'scope', p_scope)
  ) into v_id;
  return v_id;
end;
$$;
-- Project-wide default ACL (confirmed live via pg_default_acl on this
-- Supabase project) auto-grants EXECUTE to anon/authenticated/service_role
-- on every new public-schema function at CREATE time, regardless of these
-- statements. This function has NO in-function actor check (unlike
-- grant_consent/transition_dsr, which reject anon/authenticated via
-- auth.uid()/require_active_staff either way) — it blindly trusts
-- p_user_id/p_reason/p_scope. It is only ever called by lib/abuseTier.ts
-- via the service-role admin client, so it must be service_role-ONLY:
-- anon or authenticated access here would let any caller forge an
-- arbitrary session-revocation audit record for any user.
revoke execute on function public.record_session_revocation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_session_revocation(uuid, text, text)
  to service_role;
