// ⚠️ DEV STUB — testing/dev convenience only.
//
// REMOVE THIS FILE once RESEND_API_KEY is set in every environment that sends.
//
// No grep hunt required. The stub-vs-real switch exists exactly once —
// `emailLive()` + `sendEmail` in lib/email/eventEmails.ts — and every send path
// and delivery reader imports it from there. Removal is:
//   1. delete this file + its .test.ts
//   2. delete the one switch's stub branch (and its import) in
//      lib/email/eventEmails.ts
// Then drop the stub cases from the tests that mock this module; the callers'
// `'skipped' in result` branches become dead code and can go too.
// Supersedes the list in docs/plans/2026-06-04-phase-7-resend-design.md
// §"Removal protocol", which predates the consolidation.

import 'server-only';
import type { SendEmailResult, EmailAttachment } from './resend';

export type StubSendEmailResult = SendEmailResult | { skipped: true };

/**
 * Stub matching the production lib/resend.ts::sendEmail signature.
 * Always returns { skipped: true } without contacting any external service.
 * Logs UUIDs only (CLAUDE.md Rule 10 — no PII).
 */
export async function sendEmail(_opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<StubSendEmailResult> {
  // Log a recognisable marker, but NEVER include the recipient address.
  // The action layer already logs its own "queued" message with UUIDs only;
  // the stub's log here is intentionally minimal.
  // eslint-disable-next-line no-console
  console.log('[devEmailStub] sendEmail called — RESEND_API_KEY unset, would-be send skipped');
  return { skipped: true };
}
