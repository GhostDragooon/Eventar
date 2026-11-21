# Eventar personal-data inventory (as of 2026-11-05)

Source: local schema (`information_schema.columns`, public) and `pg_proc`.

- users: id, full_name, locale, timezone, created_at, updated_at, deleted_at, pseudonymised_at, preferred_name, display_language, first_name, last_name, salutation, phone, phone_country_code, country_code, avatar_url
- practitioner_licences: id, user_id, body_id, licence_number, licence_type, is_primary, status, declared_at, verified_at, lapsed_at, revoked_at, superseded_by, track, cycle_started_on, ...
- credit_ledger (append-only, hash chain): id, chain_seq, licence_id, user_id, event_id, body_id, entry_type, points, hours, category, effective_date, expires_at, attestation_status, prev_hash, hash, ...
- registrations: id, event_id, email, full_name, status, registered_at, registration_code, check_in_at, check_in_method, user_id, profile_snapshot, source
- speaker_checkins: id, event_id, speaker_name, checked_in_at, updated_by
- consent_records: id, user_id, consent_type (terms_of_service | privacy_policy | ai_processing_notice | marketing), version, granted_at, withdrawn_at, context
- data_subject_requests: request_type (access, rectification, erasure, restriction, objection, portability); status (pending, in_progress, completed, rejected, escalated)
- email_log: recipient_email, purpose, status, error, origin
- Erasure: `pseudonymise_user` (eventar_staff only, reason required) sets full_name to ERASED-<hex>, pseudonymised_at, deleted_at, then writes the audit event last.
- Vendors in package.json: resend. Turnstile, analytics and error-tracking SDKs were not found there.
