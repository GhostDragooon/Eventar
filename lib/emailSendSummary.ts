export type EmailSendCounts = {
  sent: number;
  queued: number;
  skipped: number;
  failed: number;
  error?: string;
};

/**
 * One-line, honest summary of a bulk email send for the staff UI. A whole-batch
 * error (auth / not-found) is surfaced verbatim; otherwise each non-zero outcome
 * is listed (CLAUDE.md rule 12 — nothing bypassed silently). All-zero means the
 * event had no eligible recipients.
 */
export function formatSendResult(r: EmailSendCounts): string {
  if (r.error) return r.error;
  const parts: string[] = [];
  if (r.sent) parts.push(`${r.sent} sent`);
  if (r.queued) parts.push(`${r.queued} queued`);
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  if (r.failed) parts.push(`${r.failed} failed`);
  return parts.length === 0 ? 'No eligible recipients.' : parts.join(' · ');
}
