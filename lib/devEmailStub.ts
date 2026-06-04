// ⚠️ DEV STUB — testing/dev convenience only.
//
// REMOVE THIS FILE once RESEND_API_KEY is set in .env.local:
//   See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol"
//
// No grep hunt required. The removal is a localized operation:
//   1. delete this file + its .test.ts
//   2. drop the `sendEmailStub` import in app/(public)/events/[id]/actions.ts
//   3. delete the env-switch line + the `{ skipped }` branch in the result handler
//   4. drop the "uses stub" test case in actions.test.ts

import 'server-only';
import type { SendEmailResult } from './resend';

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
}): Promise<StubSendEmailResult> {
  // Log a recognisable marker, but NEVER include the recipient address.
  // The action layer already logs its own "queued" message with UUIDs only;
  // the stub's log here is intentionally minimal.
  // eslint-disable-next-line no-console
  console.log('[devEmailStub] sendEmail called — RESEND_API_KEY unset, would-be send skipped');
  return { skipped: true };
}
