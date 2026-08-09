export type EmailSendCounts = {
  sent: number;
  queued: number;
  skipped: number;
  stalled?: number;
  failed: number;
  gaveUp?: number;
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
  // A 'queued' row that will never be delivered. Reporting it as "already
  // sent" — which is what it looked like before this counter existed — is a
  // loss rendered as a success, the exact rule-12 inversion this path keeps
  // producing. It needs the same call to action as a give-up.
  if (r.stalled) parts.push(`${r.stalled} logged earlier but never emailed — check them in from the Roster`);
  if (r.failed) parts.push(`${r.failed} failed — retrying automatically`);
  // A give-up is NOT a failure the operator can wait out: the scheduler will
  // never try again. It has to name the action, because the consequence of
  // doing nothing is a practitioner arriving without a pass.
  if (r.gaveUp) parts.push(`${r.gaveUp} couldn't be emailed — check them in from the Roster`);
  return parts.length === 0 ? 'No eligible recipients.' : parts.join(' · ');
}

/**
 * Full status line for the Event Manager send buttons: batch errors verbatim,
 * a kind-specific message when no recipients were eligible (so "nothing
 * happened" doesn't read as a dead end), and an otherwise labelled count line.
 */
export function composeSendMessage(kind: EmailKind, r: EmailSendCounts): string {
  if (r.error) return r.error;
  const total = r.sent + r.queued + r.skipped + r.failed + (r.gaveUp ?? 0) + (r.stalled ?? 0);
  if (total === 0) {
    return kind === 'reminder'
      ? 'No registered attendees to remind yet.'
      : 'No attendees marked present yet — survey invites go to checked-in attendees.';
  }
  const label = kind === 'reminder' ? 'Reminders' : 'Survey invites';
  return `${label}: ${formatSendResult(r)}`;
}
