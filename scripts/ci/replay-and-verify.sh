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
echo "REPLAY + TAMPER GATE: PASS"
