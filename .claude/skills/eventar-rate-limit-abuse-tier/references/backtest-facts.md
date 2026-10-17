# Abuse-tier backtest facts (local stack only)

- Run only against the local Supabase stack. Read the URL from `supabase status -o env`. Refuse to run unless API_URL starts with http://127.0.0.1. Never point at Seoul or `.env.local`.
- Use the service-role client for `rate_limit_check` and `record_session_revocation`, and an anon client for `signInWithPassword` and `refreshSession`.
- `rate_limit_check` with max 2, called 4 times on one key and one window, returns allowed `[true,true,false,false]`. The 3rd call has count 3, which is the first rejection and the revoke point.
- Global revoke: create a throwaway user with `auth.admin.createUser`, sign in, confirm `refreshSession` works, then `auth.admin.signOut(accessToken, 'global')`. The next `refreshSession` must fail with `Invalid Refresh Token: Refresh Token Not Found`.
- `audit_events` columns: id, chain_seq, event_type, actor_user_id, actor_role, organisation_id, subject_type, subject_id, payload, prev_hash, hash, created_at. There are no `action` or `details` columns. Read `event_type`, `payload->>'reason'` and `subject_id`.
- Audit rows are append-only. Expected residue after a backtest. Delete the throwaway rate_limits keys and users; leave audit rows alone.
- psql: `/opt/homebrew/opt/libpq/bin/psql` against the local DB URL from the same status output.
