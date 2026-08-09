import { MAX_SEND_ATTEMPTS } from '@/lib/email/sendPolicy';

/**
 * Per-recipient delivery state for one email purpose.
 *
 * Read-only derivation over `email_log`. It adds no write path and no DB
 * object — the scheduler and the send core are untouched. It exists because
 * nothing in the app ever showed whether a given attendee actually received
 * anything: the only `email_log` read was a confirmation COUNT, so an organiser
 * could not tell that the scheduler had permanently given up on someone. The
 * reminder carries the QR check-in pass, so "no email" means "cannot check in
 * at the door" — which is the whole loop, silently broken for that person.
 */

export type DeliveryLogRow = {
  registration_id: string;
  purpose: string;
  status: 'queued' | 'sent' | 'failed';
};

export type DeliveryState =
  | 'sent' // provider accepted it
  | 'retrying' // failed, still under the retry budget — no action needed yet
  | 'gave_up' // retry budget exhausted; the scheduler will NOT try again
  | 'logged_not_emailed' // a 'queued' row, terminal under email_log_dedup_idx
  | 'not_sent'; // no row at all — not due yet, or never attempted

export type DeliverySummary = {
  registrationId: string;
  fullName: string;
  state: DeliveryState;
  attempts: number;
  /** True when a human has to do something — nothing else will fix it. */
  needsAttention: boolean;
};

type Registration = { id: string; full_name: string };

/**
 * `not_sent` counts as needing attention only in the sense that the recipient
 * has nothing yet; the caller decides whether that is expected (window not
 * open) or alarming (window closed). `retrying` deliberately does NOT, because
 * the next tick handles it and flagging it would train operators to ignore the
 * flag.
 */
const NEEDS_ATTENTION: ReadonlySet<DeliveryState> = new Set<DeliveryState>([
  'gave_up',
  'logged_not_emailed',
  'not_sent',
]);

export function summariseDelivery(
  registrations: Registration[],
  logRows: DeliveryLogRow[],
  purpose: string,
): DeliverySummary[] {
  const byRegistration = new Map<string, DeliveryLogRow[]>();
  for (const row of logRows) {
    if (row.purpose !== purpose) continue;
    const bucket = byRegistration.get(row.registration_id);
    if (bucket) bucket.push(row);
    else byRegistration.set(row.registration_id, [row]);
  }

  return registrations.map((reg) => {
    const rows = byRegistration.get(reg.id) ?? [];
    const attempts = rows.filter((r) => r.status === 'failed').length;

    // A success anywhere in the history wins: retries are allowed to succeed,
    // and an earlier failure beside a later 'sent' means the retry worked.
    let state: DeliveryState;
    if (rows.some((r) => r.status === 'sent')) state = 'sent';
    else if (attempts >= MAX_SEND_ATTEMPTS) state = 'gave_up';
    else if (attempts > 0) state = 'retrying';
    else if (rows.some((r) => r.status === 'queued')) state = 'logged_not_emailed';
    else state = 'not_sent';

    return {
      registrationId: reg.id,
      fullName: reg.full_name,
      state,
      attempts,
      needsAttention: NEEDS_ATTENTION.has(state),
    };
  });
}
