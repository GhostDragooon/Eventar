/**
 * Per-purpose email delivery matrix for one event.
 *
 * Answers the "did the confirmations / reminders / surveys actually leave" at
 * a glance — the raw `email_log` aggregate that today's SQL check requires
 * (playbook §1.2.B). Complements `PassDeliveryPanel`, which names WHO among
 * the reminder recipients does not have a usable pass; this one is the count
 * matrix across all three purposes plus the live/stubbed marker.
 *
 * Read-only, no writes, no new DB object. The `email_log` aggregate query
 * lives on the details page and is passed in as `rows`.
 *
 * Not a numbered section — mounted below `PassDeliveryPanel` as a peer
 * sub-panel so the numbered 01/02/03 sections do not renumber.
 */

export type EmailDeliveryRow = {
  purpose: string;
  status: 'queued' | 'sent' | 'failed';
};

type Purpose = 'confirmation' | 'reminder' | 'survey';
type StatusKey = 'sent' | 'failed' | 'queued';

const PURPOSES: Purpose[] = ['confirmation', 'reminder', 'survey'];

const PURPOSE_LABEL: Record<Purpose, string> = {
  confirmation: 'Confirmation',
  reminder: 'Reminder + pass',
  survey: 'Survey invite',
};

/**
 * A `queued` row in email_log is TERMINAL under email_log_dedup_idx — it was
 * logged but the send never happened, and it will not be retried
 * automatically. Playbook §1.2.B calls this the "stalled" case. Distinct from
 * `failed`, which IS retryable on the scheduler path (since 20260805000000).
 *
 * `gaveUp` is NOT a raw email_log status — it is the derived state
 * PassDeliveryPanel assigns to a recipient whose scheduler retries exhausted
 * MAX_SEND_ATTEMPTS (see `summariseDelivery` in
 * `lib/delivery/deliveryStatus.ts`). It lives per-recipient there, not per-
 * aggregate here — surfacing an always-zero column in this strip taught
 * operators to distrust the strip (user-lens 2026-08-28 LOW #4). Dropped.
 */
const STATUS_ORDER: StatusKey[] = ['sent', 'failed', 'queued'];

const STATUS_LABEL: Record<StatusKey, string> = {
  sent: 'sent',
  failed: 'failed',
  queued: 'stalled', // 'queued' rows are terminal; the reader-facing word is stalled
};

const STATUS_TONE: Record<StatusKey, string> = {
  sent: 'text-on-surface',
  failed: 'text-error',
  queued: 'text-warning',
};

export function EmailDeliveryStrip({
  rows,
  /**
   * False when RESEND_API_KEY is unset — same env switch the send seam uses
   * to pick devEmailStub. Every row lands in `queued` by design in that mode,
   * so the strip labels itself as such and does not read as a delivery
   * failure. Mirrors PassDeliveryPanel's `deliveryLive` and the cron route's
   * `delivery: 'live' | 'stubbed'`.
   */
  deliveryLive,
}: {
  rows: EmailDeliveryRow[];
  deliveryLive: boolean;
}) {
  // Build a Record<purpose, Record<status, count>> — the strip's only
  // computation. Raw email_log has three statuses; they map 1:1 to columns.
  const counts: Record<Purpose, Record<StatusKey, number>> = {
    confirmation: { sent: 0, failed: 0, queued: 0 },
    reminder: { sent: 0, failed: 0, queued: 0 },
    survey: { sent: 0, failed: 0, queued: 0 },
  };
  for (const row of rows) {
    if (!isPurpose(row.purpose)) continue;
    counts[row.purpose][row.status] += 1;
  }

  return (
    <section
      aria-labelledby="email-delivery-heading"
      className="mt-md rounded-[14px] border border-outline-variant bg-surface-container-low p-md"
    >
      <div className="flex items-baseline gap-sm flex-wrap">
        <h3 id="email-delivery-heading" className="text-label-lg font-semibold text-on-surface">
          Email delivery
        </h3>
        <span
          className={
            'ml-auto inline-flex items-center gap-xs rounded-full border px-sm py-[2px] font-label-md text-label-md ' +
            (deliveryLive
              ? 'border-outline-variant text-on-surface-variant'
              : 'border-warning text-warning bg-warning-container')
          }
        >
          {deliveryLive ? 'live' : 'stubbed'}
        </span>
      </div>
      {!deliveryLive && (
        <p className="mt-xs text-body-sm text-on-surface-variant">
          RESEND_API_KEY is unset — new sends will record as stalled. Any
          &ldquo;sent&rdquo; rows above are historic (from an earlier run
          when the key was set).
        </p>
      )}
      <div className="mt-sm overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-label-md text-on-surface-variant">
              <th scope="col" className="text-left font-normal pb-xs pr-md">Purpose</th>
              {STATUS_ORDER.map((s) => (
                <th key={s} scope="col" className="text-right font-normal pb-xs px-md tabular-nums">
                  {STATUS_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PURPOSES.map((p) => (
              <tr key={p} className="border-t border-outline-variant">
                <th scope="row" className="text-left font-normal py-xs pr-md text-on-surface">
                  {PURPOSE_LABEL[p]}
                </th>
                {STATUS_ORDER.map((s) => (
                  <td
                    key={s}
                    className={
                      'text-right py-xs px-md tabular-nums ' +
                      (counts[p][s] > 0 ? STATUS_TONE[s] : 'text-on-surface-variant')
                    }
                  >
                    {counts[p][s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isPurpose(p: string): p is Purpose {
  return p === 'confirmation' || p === 'reminder' || p === 'survey';
}
