-- Map item 7 (a) + (c) of docs/plans/2026-11-05-db-cleanup-dependency-map.md
-- (K2 Integrity Substrate; Ivan's pick 2026-11-06: "Audit every delete").
--
-- (a) Evidence deletes leave a trace. participation_evidence keeps its
-- service_role DELETE grant (Hard Rule 11 lifecycle row,
-- 20260912000000_participation_evidence.sql). No app code or DB function
-- deletes evidence; only test teardown does, and ADR-0003 says CPD history
-- is not erasable. Until now a delete broke verify_evidence_chain's links
-- with no record of the removed row. An AFTER DELETE trigger now writes one
-- `evidence_deleted` audit row per deleted row, carrying its chain_seq,
-- hash and prev_hash, so every link break can be matched to its cause.
-- Deleting is still possible; deleting silently is not.
--
-- (c) The three chain verifiers get one grant shape: EXECUTE for
-- service_role only. verify_evidence_chain was authenticated-only (any
-- signed-in user could read the global evidence count and tamper status:
-- Low finding in docs/plans/security-audit-20261104.md), while the audit and
-- ledger verifiers were already service_role-only. No app code calls
-- verify_evidence_chain (grep of app/ lib/ components/ scripts/, 2026-11-06).
--
-- Rollback:
--   drop trigger participation_evidence_delete_audited on public.participation_evidence;
--   drop function app_private.audit_evidence_delete();
--   revoke execute on function public.verify_evidence_chain() from service_role;
--   grant execute on function public.verify_evidence_chain() to authenticated;
--   comment on function public.verify_audit_chain() is null;  (and the other two)

-- The payload carries every column compute_evidence_hash hashes, so the
-- deleted row's hash can be recomputed from the audit row, plus user_id and
-- actor_id (UUIDs). device_metadata and local_unlock_metadata stay out: they
-- may hold device details. Timestamps render in UTC because of the pinned
-- TimeZone, matching the hash input.
create function app_private.audit_evidence_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'UTC'
set datestyle = 'ISO, MDY'
as $$
begin
  perform public.write_audit_event(
    'evidence_deleted',
    auth.uid(),
    coalesce(auth.role(), session_user::text),
    old.organisation_id,
    'participation_evidence',
    old.id,
    jsonb_build_object(
      'chain_seq', old.chain_seq,
      'hash', encode(old.hash, 'hex'),
      'prev_hash', encode(old.prev_hash, 'hex'),
      'evidence_type', old.evidence_type,
      'event_id', old.event_id,
      'registration_id', old.registration_id,
      'occurrence_id', old.occurrence_id,
      'capture_method', old.capture_method,
      'source', old.source,
      'captured_at', old.captured_at::text,
      'attestation_strength', old.attestation_strength,
      'created_at', old.created_at::text,
      'user_id', old.user_id,
      'actor_id', old.actor_id,
      -- Repeats actor_role on purpose: actor_role is not in the audit hash,
      -- the payload is.
      'deleted_by_role', coalesce(auth.role(), session_user::text)
    )
  );
  return old;
end;
$$;

revoke all on function app_private.audit_evidence_delete() from public, anon, authenticated, service_role;

comment on function app_private.audit_evidence_delete() is
  'K2 (Q50): AFTER DELETE FOR EACH ROW on participation_evidence; writes one evidence_deleted audit row per deleted row. It takes the global audit-chain lock and holds it until commit, so in a multi-statement transaction delete evidence LAST (audit insert last rule): a check-in waiting on that lock while holding a row this transaction later touches would deadlock.';

create trigger participation_evidence_delete_audited
  after delete on public.participation_evidence
  for each row execute function app_private.audit_evidence_delete();

revoke execute on function public.verify_evidence_chain() from authenticated;
grant execute on function public.verify_evidence_chain() to service_role;

comment on function public.verify_audit_chain() is
  'K2: one row per audit_events row. content_valid recomputes the sha256 over the hashed columns; link_valid checks prev_hash. Pinned to TimeZone=UTC, DateStyle=ISO, bytea_output=hex (Q49), so the verdict does not depend on the caller''s session. service_role only.';
comment on function public.verify_evidence_chain() is
  'K2: one row per participation_evidence row. content_valid recomputes the sha256; link_valid checks prev_hash. Pinned to UTC/ISO/hex (Q49). service_role only. Link checks miss some deletions: a deleted head or tail row leaves no break, and chain_seq gaps also come from unused sequence values. Completeness check: every audit_events row of type evidence_recorded should have its subject_id either in participation_evidence or in an evidence_deleted row (written since 20261106110000; earlier deletes left no trace). A break is explained when an evidence_deleted payload chain_seq falls in its gap; payload hashes are hex text, so compare with encode(hash, ''hex'').';
comment on function public.verify_ledger_chain() is
  'K2: one row per credit_ledger row (append-only for every role, so no deletes). Pinned to UTC/ISO/hex. service_role only.';

do $$
declare
  f text;
begin
  foreach f in array array['verify_audit_chain', 'verify_evidence_chain', 'verify_ledger_chain'] loop
    if has_function_privilege('anon', format('public.%I()', f), 'EXECUTE')
       or has_function_privilege('authenticated', format('public.%I()', f), 'EXECUTE')
       or not has_function_privilege('service_role', format('public.%I()', f), 'EXECUTE') then
      raise exception 'verifier grant shape wrong on public.%', f;
    end if;
  end loop;
  if has_function_privilege('service_role', 'app_private.audit_evidence_delete()', 'EXECUTE') then
    raise exception 'audit_evidence_delete must not be directly executable';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.participation_evidence'::regclass
                    and tgname = 'participation_evidence_delete_audited' and tgenabled = 'O') then
    raise exception 'evidence delete trigger missing or disabled';
  end if;
  if not has_table_privilege('service_role', 'public.participation_evidence', 'DELETE') then
    raise exception 'service_role DELETE on participation_evidence must be retained (Ivan 2026-11-06)';
  end if;
end $$;
