export type EmailSendCounts = {
  sent: number;
  queued: number;
  skipped: number;
  failed: number;
  error?: string;
};

export type EmailKind = 'reminder' | 'survey';

/**
 * One-line, honest summary of a bulk email send for the staff UI. A whole-batch
 * error (auth / not-found) is surfaced verbatim; otherwise each non-zero outcome
 * is listed (CLAUDE.md rule 12 — nothing bypassed silently).
 *
 * Wording matters here: in dev (RESEND_API_KEY unset) the batch lands on the
 * stub and comes back as `queued`, which to an operator reads like "about to
 * send" — but nothing was emailed and nothing ever will be. So `queued` is
 * surfaced as "logged (dev — not emailed)", never the bare word "queued". An
 * idempotent `skipped` (a row already existed) is surfaced as "already sent",
 * never a bare "skipped" (which reads like a failure).
 */
export function formatSendResult(r: EmailSendCounts): string {
  if (r.error) return r.error;
  const parts: string[] = [];
  if (r.sent) parts.push(`${r.sent} sent`);
  if (r.queued) parts.push(`${r.queued} logged (dev — not emailed)`);
  if (r.skipped) parts.push(`${r.skipped} already sent`);
  if (r.failed) parts.push(`${r.failed} failed`);
  return parts.length === 0 ? 'No eligible recipients.' : parts.join(' · ');
}

/**
 * Full status line for the Event Manager send buttons: batch errors verbatim,
 * a kind-specific message when no recipients were eligible (so "nothing
 * happened" doesn't read as a dead end), and an otherwise labelled count line.
 */
export function composeSendMessage(kind: EmailKind, r: EmailSendCounts): string {
  if (r.error) return r.error;
  const total = r.sent + r.queued + r.skipped + r.failed;
  if (total === 0) {
    return kind === 'reminder'
      ? 'No registered attendees to remind yet.'
      : 'No attendees marked present yet — survey invites go to checked-in attendees.';
  }
  const label = kind === 'reminder' ? 'Reminders' : 'Survey invites';
  return `${label}: ${formatSendResult(r)}`;
}
