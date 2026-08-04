-- 2026-08-04 — DEFERRED item 55: bound the credit_ledger chain lock.
--
-- THE PROBLEM. Every credit issuance serialises through ONE global advisory
-- lock (`pg_advisory_xact_lock(hashtext('credit_ledger_chain'))`, taken in the
-- compute_credit_ledger_hash BEFORE INSERT trigger), and that lock is awaited
-- on the check-in request path: self_check_in → awardAttendanceCredit →
-- award_attendance_credit → record_credit_entry → INSERT → trigger. With no
-- acquisition timeout the wait is unbounded, so a spiky arrival distribution
-- at a real event queues tail check-ins behind whoever holds the lock.
--
-- Measured on the local stack before this migration: with the chain lock held
-- by another session, record_credit_entry blocked for the full 6s ceiling and
-- was stopped only by an explicit statement_timeout (57014). Nothing in the
-- product sets one.
--
-- THE FIX is one line and no new branches, because the visibility machinery
-- already exists. A lock timeout raises 55P03, which is NOT caught by
-- award_attendance_credit's `exception when unique_violation` block, so it
-- propagates to lib/cpd/awardAttendanceCredit.ts's error path — which logs
-- console.error and returns { status: 'failed', reason: '55P03' }. That is the
-- correct classification: a lock timeout is a TECHNICAL failure meaning "this
-- credit did not post, reconcile it", categorically different from the
-- business `skipped:<reason>` outcomes (no_licence, not_cpd, cancelled) that
-- log at info because nothing is wrong.
--
-- Deliberately NOT caught and rewritten to `skipped:lock_timeout`: that would
-- log a real failure at info level and read as "correctly nothing posted"
-- (rule 12 — fail visibly). The scanner is still never blocked, because
-- app/(public)/checkin/confirm/actions.ts treats attendance as authoritative
-- and ignores the credit outcome entirely; recovery is reconcile-event.ts.
--
-- WHY 1s. The check-in burst gate's budget is P99 < 2s. The lock is held only
-- for a hash computation plus one insert, so normal contention resolves in
-- single-digit ms; 1s is far above real contention and still leaves half the
-- P99 budget. A credit that cannot get the lock within 1s is better reconciled
-- later than paid for by the person standing at the door.
--
-- ALTER, not CREATE OR REPLACE. Re-declaring a 14-argument function body to
-- change one setting is how two agents clobbered each other's work earlier
-- today (see 20260803120000). The setting is all that changes, so the
-- statement should say only that.
--
-- ponytail: global lock retained; per-body/per-event chains are the real fix at
-- scale and stay deferred to Stage 10 with the rest of the B3 chain design.

alter function public.record_credit_entry(
  p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid,
  p_entry_type text, p_points numeric, p_hours numeric, p_category text,
  p_effective_date date, p_attestation_status text, p_actor_id uuid,
  p_references_entry_id uuid, p_reason text, p_transfer_reference_id uuid
) set lock_timeout to '1s';

do $$
declare cfg text[];
begin
  select p.proconfig into cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_credit_entry';

  if cfg is null or not (cfg @> array['lock_timeout=1s']) then
    raise exception 'record_credit_entry has no lock_timeout: %', cfg;
  end if;
  -- The ALTER must not have dropped the pinned search_path (a definer function
  -- without it is a privilege-escalation vector, and every one of the 30 in
  -- this schema pins it).
  if not (cfg @> array['search_path=public, pg_temp']) then
    raise exception 'record_credit_entry lost its pinned search_path: %', cfg;
  end if;
end $$;

-- Rollback: alter function ... reset lock_timeout;
