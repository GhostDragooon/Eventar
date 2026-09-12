-- Add 'skipped' to email_log status check constraint.
-- Walk-in registrations deliberately skip confirmation email;
-- the email_log row records that decision (Hard Rule 12).
ALTER TABLE email_log DROP CONSTRAINT email_log_status_check;
ALTER TABLE email_log ADD CONSTRAINT email_log_status_check
  CHECK (status = ANY (ARRAY['queued', 'sent', 'failed', 'skipped']));
