-- Pin TimeZone, DateStyle and bytea_output on the audit and evidence hash
-- and verify functions (K2 Integrity Substrate; Decide 0 of
-- docs/plans/2026-11-05-db-cleanup-dependency-map.md; Decisions Log Q49,
-- Ivan's go 2026-11-06).
--
-- Why: compute_audit_hash / verify_audit_chain hash created_at::text, and
-- compute_evidence_hash / verify_evidence_chain hash captured_at::text,
-- created_at::text and prev_hash::text (bytea). Those casts follow the
-- session's TimeZone, DateStyle and bytea_output. The functions pinned only
-- search_path, so a session with a non-zero UTC offset or a non-ISO
-- DateStyle saw rows as tampered, and a row written from such a session got
-- a hash that never verifies in UTC. Measured 2026-11-06, before this
-- migration: under Asia/Hong_Kong, 70,857/70,857 local audit rows,
-- 590/590 local evidence rows and 38,081/38,081 Seoul audit rows failed
-- content verification; under UTC, content failures were 0 on both.
-- (Separately, the local evidence chain has 70 broken links under every
-- setting, from fixture deletes; this migration does not touch that.)
--
-- This copies the pin compute_credit_ledger_hash / verify_ledger_chain
-- already carry (20260709260000_credit_ledger_hardening.sql). Every stored
-- hash was written under the UTC database default, so pinning to UTC
-- changes no existing verdict: no stored hash is rewritten. Checked on
-- local after the pin, and on Seoul under UTC (read-only) before it.
--
-- Rollback, for each of the four functions below:
--   alter function public.compute_audit_hash()
--     reset timezone reset datestyle reset bytea_output;
-- That restores the pre-pin behaviour (search_path pin only), which is the
-- bug.
--
-- Caution: a later `create or replace function` on any of these four must
-- restate all four SET clauses, or it silently drops the pin.
-- tests/audit/chain_timezone.test.ts asserts the proconfig and fails if so.

alter function public.compute_audit_hash()
  set timezone = 'UTC' set datestyle = 'ISO, MDY' set bytea_output = 'hex';
alter function public.verify_audit_chain()
  set timezone = 'UTC' set datestyle = 'ISO, MDY' set bytea_output = 'hex';
alter function public.compute_evidence_hash()
  set timezone = 'UTC' set datestyle = 'ISO, MDY' set bytea_output = 'hex';
alter function public.verify_evidence_chain()
  set timezone = 'UTC' set datestyle = 'ISO, MDY' set bytea_output = 'hex';

do $$
declare
  f text;
  cfg text[];
begin
  foreach f in array array[
    'compute_audit_hash', 'verify_audit_chain',
    'compute_evidence_hash', 'verify_evidence_chain',
    'compute_credit_ledger_hash', 'verify_ledger_chain'
  ] loop
    select proconfig into cfg
      from pg_proc where pronamespace = 'public'::regnamespace and proname = f;
    if cfg is null
       or not ('TimeZone=UTC' = any(cfg))
       or not ('DateStyle=ISO, MDY' = any(cfg))
       or not ('bytea_output=hex' = any(cfg))
       or not exists (select 1 from unnest(cfg) s where s like 'search_path=%') then
      raise exception 'chain pin missing on public.%: %', f, cfg;
    end if;
  end loop;
end $$;
