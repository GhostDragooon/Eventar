#!/usr/bin/env bash
# Replay-from-zero + chain/tamper gate. Throwaway local stack only.
set -euo pipefail
supabase db reset
q() { docker exec supabase_db_Eventar psql -U postgres -d postgres -tA -c "$1"; }
# 1) both chains verify clean on a fresh replay
# NOTE: verify_audit_chain()/verify_ledger_chain() return ONE ROW PER LEDGER
# ENTRY (link_valid/content_valid booleans per row), not "zero rows when
# clean" — bare count(*) equals the entry count regardless of tamper state.
# Filter to actually-broken rows (plan's literal snippet verified against
# the real migrations: supabase/migrations/20260704130400_init_audit_chain.sql,
# 20260709250000_credit_ledger.sql — corrected here, not copied blind).
[ "$(q 'select count(*) from verify_audit_chain() where not link_valid or not content_valid')" = "0" ] || { echo "audit chain dirty on fresh replay"; exit 1; }
[ "$(q 'select count(*) from verify_ledger_chain() where not link_valid or not content_valid')" = "0" ] || { echo "ledger chain dirty on fresh replay"; exit 1; }
# 2) two real writer events, tamper the first, expect detection
# write_audit_event(p_event_type, p_actor_user_id uuid, p_actor_role text,
# p_organisation_id uuid, p_subject_type text, p_subject_id uuid, p_payload
# jsonb) — p_actor_user_id is a uuid column, so the literal 'system' belongs
# in p_actor_role, not in that slot (the plan's original snippet put it
# there, which would raise "invalid input syntax for type uuid").
#
# The whole probe runs inside ONE transaction that is always ROLLED BACK.
# Previously these ran as four separate autocommit statements, which left a
# permanently-tampered audit_events row behind. That is harmless on a
# throwaway CI stack but poisons a persistent local one: every subsequent
# `pnpm test:rls` then failed its "verify_audit_chain reports zero broken
# links" assertion (7 files / 8 tests), because the chain really was broken —
# by this script. Both are documented gates in docs/plans/PROJECT_STATE.md,
# so running them in the documented order was guaranteed to fail the second.
# Rolling back also keeps the gate honest about Hard Rule 11: audit_events is
# permanent and append-only, so a test must not leave probe rows in it either.
# The count is tagged and extracted by name, NOT by position: psql prints
# command tags (BEGIN/UPDATE/ROLLBACK) and the write_audit_event return
# values on stdout too, so `tail -1` picks up "ROLLBACK" and the numeric
# comparison below then dies with "integer expression expected".
BROKEN=$(q "begin;
select write_audit_event('ci_probe', null, 'system', null, null, null, '{}'::jsonb);
select write_audit_event('ci_probe', null, 'system', null, null, null, '{}'::jsonb);
update audit_events set payload='{\"tampered\":true}'::jsonb where chain_seq=(select min(chain_seq) from audit_events where event_type='ci_probe');
select 'BROKENCOUNT=' || count(*) from verify_audit_chain() where not link_valid or not content_valid;
rollback;" | sed -n 's/^BROKENCOUNT=//p')
[ -n "$BROKEN" ] || { echo "tamper probe produced no count — the probe transaction itself failed"; exit 1; }
[ "$BROKEN" -ge 1 ] || { echo "tamper NOT detected"; exit 1; }
# Prove the rollback actually took: no residue, chain clean again.
[ "$(q "select count(*) from audit_events where event_type='ci_probe'")" = "0" ] || { echo "ci_probe rows leaked into audit_events"; exit 1; }
[ "$(q 'select count(*) from verify_audit_chain() where not link_valid or not content_valid')" = "0" ] || { echo "chain left dirty after the tamper probe"; exit 1; }
# 3) grant gate: no API role holds TRUNCATE or TRIGGER on any public table
# (20261010175112). CI replay does not run test:rls, so a future `grant all` in
# a migration or the seed is otherwise caught only on a developer's machine.
# Lists the offending (role, privilege, table) triples, expects none. Views count too: TRIGGER is grantable on one.
HELD=$(q "select coalesce(string_agg(r.role || ' ' || p.priv || ' ' || c.relname, ', '), '') from pg_class c
  cross join (values ('anon'),('authenticated'),('service_role')) r(role)
  cross join (values ('TRUNCATE'),('TRIGGER')) p(priv)
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','f','v','m')
   and has_table_privilege(r.role, c.oid, p.priv)")
[ -z "$HELD" ] || { echo "API roles hold TRUNCATE/TRIGGER on: $HELD"; exit 1; }
# 4) SEC-01 (20261023140000, 20261023150000): anon holds no INSERT, UPDATE or DELETE on any public table or view
# (column-level counts for INSERT and UPDATE), invite_tokens is definer-only for service_role (SELECT and DELETE
# only), and authenticated cannot INSERT registrations.
HELD_DML=$(q "select coalesce(string_agg(c.relname || ' ' || p.priv, ', '), '') from pg_class c
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) p(priv)
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','f','v','m')
   and case when p.priv = 'DELETE' then has_table_privilege('anon', c.oid, p.priv)
            else has_any_column_privilege('anon', c.oid, p.priv) end")
[ -z "$HELD_DML" ] || { echo "anon holds DML on: $HELD_DML"; exit 1; }
HELD_INV=$(q "select coalesce(string_agg(p.priv, ', '), '') from (values ('INSERT'),('UPDATE')) p(priv)
 where has_table_privilege('service_role', 'public.invite_tokens', p.priv)")
[ -z "$HELD_INV" ] || { echo "service_role holds $HELD_INV on invite_tokens"; exit 1; }
[ "$(q "select has_table_privilege('authenticated', 'public.registrations', 'INSERT')")" = "f" ] || { echo "authenticated holds INSERT on registrations"; exit 1; }
# 5) SEC-03 (20261024120000): no API role hard-deletes an event
HELD_EVDEL=$(q "select coalesce(string_agg(r.role, ', '), '') from (values ('anon'),('authenticated')) r(role)
 where has_table_privilege(r.role, 'public.events', 'DELETE')")
[ -z "$HELD_EVDEL" ] || { echo "API roles hold DELETE on events: $HELD_EVDEL"; exit 1; }
echo "REPLAY + TAMPER GATE: PASS"
