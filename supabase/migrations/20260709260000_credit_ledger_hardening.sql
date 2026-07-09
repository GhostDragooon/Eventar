-- CPD Sprint 3a / Task 8 follow-up — harden the credit_ledger tamper-evidence
-- before Task 9 writes any real (regulator-facing) row. An append-only chain
-- cannot be re-hashed once rows exist, so every fix below MUST land while the
-- table is still empty. Found by code-quality review; all are plan-level gaps
-- (the plan's own SQL was under-specified), not new regressions.
--
-- C1 — the old hash concatenated points||hours with no delimiter, so
--      (points=1,hours=1) and (points=11,hours=NULL) hashed identically; an
--      owner could move value between the two credit-unit columns undetected.
-- C2 — the old hash covered only 6 of ~15 semantic columns; body_id, user_id,
--      category, expires_at, attestation_status, reason, actor_id, the two
--      reference ids and event_id were all silently mutable with verify() still
--      green. Ivan's decision: hash EVERY immutable-at-write column (append-only,
--      so all of them). Corrections flow through new credit_adjusted entries,
--      never mutations — which is the point of the ledger.
-- I1 — created_at/effective_date/expires_at/prev_hash ::text renderings depend
--      on session GUCs (TimeZone, DateStyle, bytea_output); a verify run under
--      different GUCs than the write could report a spurious "tampered". Pinned
--      in both functions' SET clause below, and prev_hash is hex-encoded.
--
-- Fixes C1+C2+I1 together via jsonb_build_object: JSON structure gives
-- unambiguous field boundaries (C1), lets every column in (C2), and jsonb
-- normalises key order deterministically. GUCs pinned + prev_hash hex-encoded
-- close the rendering-dependence (I1). compute and verify use a BYTE-IDENTICAL
-- expression — any divergence would make verify always fail.

create or replace function public.compute_credit_ledger_hash() returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
set timezone = 'UTC'
set datestyle = 'ISO, MDY'
set bytea_output = 'hex' as $$
declare
  v_prev_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtext('credit_ledger_chain'));

  -- chain_seq drawn inside the lock so lock order == chain_seq order == chain
  -- order (identity defaults evaluate at tuple formation, before this trigger).
  new.chain_seq := nextval('public.credit_ledger_chain_seq_seq');

  select hash into v_prev_hash from public.credit_ledger
    order by chain_seq desc limit 1;

  new.prev_hash := coalesce(v_prev_hash, 'GENESIS'::bytea);
  new.hash := extensions.digest(
    jsonb_build_object(
      'id',                    new.id,
      'chain_seq',             new.chain_seq,
      'licence_id',            new.licence_id,
      'user_id',               new.user_id,
      'event_id',              new.event_id,
      'body_id',               new.body_id,
      'entry_type',            new.entry_type,
      'points',                new.points,
      'hours',                 new.hours,
      'category',              new.category,
      'effective_date',        new.effective_date,
      'expires_at',            new.expires_at,
      'references_entry_id',   new.references_entry_id,
      'transfer_reference_id', new.transfer_reference_id,
      'reason',                new.reason,
      'actor_id',              new.actor_id,
      'attestation_status',    new.attestation_status,
      'created_at',            extract(epoch from new.created_at)
    )::text || encode(new.prev_hash, 'hex'),
    'sha256'
  );
  return new;
end;
$$;

create or replace function public.verify_ledger_chain()
returns table(chain_seq bigint, link_valid boolean, content_valid boolean)
language sql security definer
set search_path = public, extensions, pg_temp
set timezone = 'UTC'
set datestyle = 'ISO, MDY'
set bytea_output = 'hex' as $$
  with ordered as (
    select *, lag(hash) over (order by chain_seq) as expected_prev
    from public.credit_ledger
  )
  select
    ordered.chain_seq,
    (ordered.prev_hash = coalesce(ordered.expected_prev, 'GENESIS'::bytea)) as link_valid,
    (ordered.hash = extensions.digest(
      jsonb_build_object(
        'id',                    ordered.id,
        'chain_seq',             ordered.chain_seq,
        'licence_id',            ordered.licence_id,
        'user_id',               ordered.user_id,
        'event_id',              ordered.event_id,
        'body_id',               ordered.body_id,
        'entry_type',            ordered.entry_type,
        'points',                ordered.points,
        'hours',                 ordered.hours,
        'category',              ordered.category,
        'effective_date',        ordered.effective_date,
        'expires_at',            ordered.expires_at,
        'references_entry_id',   ordered.references_entry_id,
        'transfer_reference_id', ordered.transfer_reference_id,
        'reason',                ordered.reason,
        'actor_id',              ordered.actor_id,
        'attestation_status',    ordered.attestation_status,
        'created_at',            extract(epoch from ordered.created_at)
      )::text || encode(ordered.prev_hash, 'hex'),
      'sha256'
    )) as content_valid
  from ordered
  order by ordered.chain_seq;
$$;

-- C3 — enforce append-only against ALL app roles, incl. service_role
-- (BYPASSRLS + default table DML grants let it write/mutate/delete directly,
-- bypassing record_credit_entry entirely). Mirrors audit_events' own table
-- revokes. record_credit_entry (Task 9) is SECURITY DEFINER owned by the table
-- owner (postgres), which retains full rights, so the intended write path is
-- unaffected — exactly like write_audit_event after audit_events' revokes.
revoke insert, update, delete on public.credit_ledger from anon, authenticated, service_role;

-- I2 — chain_seq must be unique: verify()'s lag(hash) over (order by chain_seq)
-- is only deterministic if chain_seq has no ties. The sequence guarantees it in
-- practice, but audit_events.chain_seq carries the explicit constraint and
-- verify's correctness leans on it. Replace the non-unique index with a unique one.
drop index if exists public.credit_ledger_chain_seq_idx;
create unique index credit_ledger_chain_seq_idx on public.credit_ledger(chain_seq);

-- I3 — verify_ledger_chain is SECURITY DEFINER and reads ALL rows regardless of
-- RLS, so granting it to `authenticated` (as the original migration did, with a
-- comment falsely claiming RLS governs visibility) leaks per-row chain_seq +
-- validity to any logged-in practitioner. audit_events grants verify to
-- service_role only. Match that. Re-assert the revoke-all-then-grant hygiene.
revoke all on function public.verify_ledger_chain() from public, anon, authenticated;
grant execute on function public.verify_ledger_chain() to service_role;
