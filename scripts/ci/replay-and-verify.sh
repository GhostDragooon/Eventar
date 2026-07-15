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
q "select write_audit_event('ci_probe', null, 'system', null, null, null, '{}'::jsonb)" >/dev/null
q "select write_audit_event('ci_probe', null, 'system', null, null, null, '{}'::jsonb)" >/dev/null
q "update audit_events set payload='{\"tampered\":true}'::jsonb where chain_seq=(select min(chain_seq) from audit_events where event_type='ci_probe')"
[ "$(q 'select count(*) from verify_audit_chain() where not link_valid or not content_valid')" -ge 1 ] || { echo "tamper NOT detected"; exit 1; }
echo "REPLAY + TAMPER GATE: PASS"
