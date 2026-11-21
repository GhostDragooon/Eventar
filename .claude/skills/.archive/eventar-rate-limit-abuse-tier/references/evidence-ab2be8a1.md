PASS  audit row: session_revoked|3_session_rate_limit_hits_60min|75db4028-19bb-44c1-a2e6-926ad0052139
ERROR:  column "action" does not exist — audit_events has event_type, payload, subject_id (no action/details)
`ABUSE_MAX` was 3. The check allows while count is at or below max, so it revoked on the 4th hit; it is now 2.
The subject is now taken from the caller's own session. `staff.id` is not an auth user id: 0 of 65 local staff rows match.