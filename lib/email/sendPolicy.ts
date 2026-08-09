/**
 * Send policy shared by the send core and any read-only derivation over
 * `email_log`.
 *
 * Deliberately dependency-free: `lib/email/eventEmails.ts` is `server-only`
 * (it constructs the service-role client), so anything importing a constant
 * from it drags that into pure code and breaks unit tests. This file is the
 * seam — no imports, no side effects.
 */

/**
 * How many times one recipient's send may be attempted for a given
 * (event, purpose) before the scheduler stops retrying them.
 *
 * `failed` rows are retryable (migration 20260805000000), so without a cap a
 * permanently-bad address — hard bounce, closed mailbox, typo'd domain — is
 * retried on EVERY tick for the whole window: 12 times across a reminder's
 * hour, 288 across a survey's 24h grace. That burns provider quota and
 * rate-limit headroom the live sends need, so one dead address could starve a
 * roster of good ones.
 *
 * It bounds AUTOMATED sends only — a human clicking "Send reminders now" is
 * not a retry storm, and that button is the operator's only rescue lever.
 */
export const MAX_SEND_ATTEMPTS = 3;
