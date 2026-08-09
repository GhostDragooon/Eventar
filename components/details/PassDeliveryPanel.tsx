import { summariseDelivery, type DeliveryLogRow, type DeliverySummary } from '@/lib/delivery/deliveryStatus';

/**
 * Who actually received their check-in pass.
 *
 * A self-contained read-only panel: no write path, no new DB object, and it
 * modifies no existing section (the numbered 01/02/03 chrome is untouched, so
 * nothing renumbers). Deliberately a sub-panel of Registration rather than a
 * fourth numbered section.
 *
 * It exists because nothing in the app ever showed this. The only `email_log`
 * read was a confirmation COUNT, so when the scheduler permanently gave up on a
 * recipient the organiser was never told — and the reminder is what carries the
 * QR pass, so that attendee simply cannot check in at the door.
 *
 * Shows the EXCEPTIONS, not the roster. A list of forty green ticks trains
 * people to skim; a short list of who needs help does not.
 */

/**
 * The panel's chrome, defined once. Deliberately NOT `SectionShell` — that
 * carries the numbered 01/02/03 chips, and adding a fourth would renumber the
 * existing sections. This is a sub-panel of Registration, so it reads as
 * subordinate: smaller heading, tighter radius, no chip.
 */
function Panel({ meta, children }: { meta: string; children: React.ReactNode }) {
  return (
    <div className="mt-md rounded-[14px] border border-outline-variant bg-surface-container-low p-md">
      <div className="flex items-baseline gap-sm">
        <h3 className="text-label-lg font-semibold text-on-surface">Pass delivery</h3>
        <span className="ml-auto font-label-md text-label-md normal-case tracking-normal tabular-nums text-on-surface-variant">
          {meta}
        </span>
      </div>
      {children}
    </div>
  );
}

const COPY: Record<DeliverySummary['state'], { label: string; hint: string } | null> = {
  sent: null, // counted, never listed
  retrying: null, // the next tick handles it — flagging it would train people to ignore flags
  gave_up: {
    // Deliberately does NOT say "re-send below": EmailSendControls renders
    // ABOVE this, inside Registration's action slot, and only in the upcoming
    // and live states — so it is often not on the page at all. The roster is
    // the one recovery that always exists.
    label: 'no pass sent',
    hint: 'the scheduler stopped retrying — use “Send reminders now”, or check them in from the roster',
  },
  logged_not_emailed: {
    label: 'logged, never emailed',
    hint: 'recorded but not delivered — check them in from the roster',
  },
  not_sent: { label: 'not sent yet', hint: 'nothing has gone out to them' },
};

export function PassDeliveryPanel({
  registrations,
  logRows,
  purpose = 'reminder',
  /** Before the reminder window opens, "not sent yet" is expected, not a problem. */
  windowOpen,
  /**
   * False when RESEND_API_KEY is unset — sends land on the dev stub and every
   * row stays `queued` BY DESIGN. Without this the panel reports the entire
   * roster as having no pass on every local run, which is true but expected,
   * and an alarm that always fires is an alarm nobody reads. Mirrors
   * formatSendResult's "logged (dev — not emailed)" and the cron route's
   * `delivery: 'stubbed'`.
   */
  deliveryLive = true,
}: {
  registrations: Array<{ id: string; full_name: string }>;
  logRows: DeliveryLogRow[];
  purpose?: string;
  windowOpen: boolean;
  deliveryLive?: boolean;
}) {
  if (registrations.length === 0) return null;

  const summaries = summariseDelivery(registrations, logRows, purpose);
  const sent = summaries.filter((s) => s.state === 'sent').length;
  const retrying = summaries.filter((s) => s.state === 'retrying').length;

  // Pre-window, a missing pass is just "not due". Only surface the states that
  // are wrong regardless of timing, or the panel cries wolf on every new event.
  const flagged = summaries.filter((s) => {
    // Stubbed delivery: a queued row means "the stub ran", not "delivery
    // stalled", so it is not a fault to raise.
    if (!deliveryLive && s.state === 'logged_not_emailed') return false;
    return windowOpen ? s.needsAttention : s.state === 'gave_up' || s.state === 'logged_not_emailed';
  });

  // The dev stub leaves every row 'queued' by design, so with no provider
  // configured the honest headline is "logged, not emailed" — not a delivery
  // count that reads as success, and not a fault.
  const stubbed = !deliveryLive && summaries.some((s) => s.state === 'logged_not_emailed');
  const logged = summaries.filter((s) => s.state === 'logged_not_emailed').length;

  return (
    <Panel
      meta={
        stubbed
          ? `${logged} logged (dev — not emailed)`
          : `${sent} of ${registrations.length} delivered${retrying > 0 ? ` · ${retrying} retrying` : ''}`
      }
    >
      {flagged.length === 0 ? (
        <p className="mt-sm text-body-sm text-on-surface-variant">
          {stubbed
            ? 'No email provider is configured, so passes were recorded but never sent. Nothing is wrong with this event.'
            : sent === registrations.length
              ? 'Everyone has their check-in pass.'
              : 'Nothing needs attention yet — passes go out when check-in opens.'}
        </p>
      ) : (
        <>
          <p className="mt-sm text-body-sm text-[color:var(--error)]">
            {flagged.length} {flagged.length === 1 ? 'attendee has' : 'attendees have'} no usable pass. They can still
            be checked in by name from the roster.
          </p>
          <ul className="mt-sm divide-y divide-outline-variant">
            {flagged.map((s) => {
              const copy = COPY[s.state];
              if (!copy) return null;
              return (
                <li key={s.registrationId} className="flex flex-wrap items-baseline gap-x-sm py-sm">
                  <span className="text-body-md text-on-surface">{s.fullName}</span>
                  <span className="text-label-md font-semibold text-[color:var(--error)]">{copy.label}</span>
                  <span className="w-full text-body-sm text-on-surface-variant">{copy.hint}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
