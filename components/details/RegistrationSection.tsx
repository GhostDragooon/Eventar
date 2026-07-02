import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { SectionShell, SectionStub } from './SectionChrome';
import { RegistrationCloseEditor } from './RegistrationCloseEditor';

type Props = {
  eventId: string;
  registered: number;
  maxAttendees: number | null;
  registrationCloseAt: string | null;
  registeredAt: string[];
  nowMs: number;
  lifecycle: Lifecycle;
  // G6: count of confirmation emails actually delivered (email_log.status='sent').
  // Word "sent" matters — copy must never say "delivered".
  confirmationsSent: number;
};

// Section 01 — Registration. Full card while the window is open (draft /
// registering / upcoming); collapses to a one-line stub once the door opens
// (live / completed / cancelled) — the scoreboard already carries the number.
export function RegistrationSection({
  eventId,
  registered,
  maxAttendees,
  registrationCloseAt,
  registeredAt,
  nowMs,
  lifecycle,
  confirmationsSent,
}: Props) {
  if (lifecycle === 'live' || lifecycle === 'completed' || lifecycle === 'cancelled') {
    return (
      <SectionStub
        index="01"
        title="Registration"
        detail="closed"
        meta={`${registered} final · ${confirmationsSent} confirmed`}
      />
    );
  }

  if (lifecycle === 'drafted') {
    return (
      <SectionShell index="01" title="Registration" meta="not open yet">
        <p className="font-body-md text-body-md text-on-surface-variant">Publish to begin registration.</p>
      </SectionShell>
    );
  }

  const pct =
    maxAttendees != null && maxAttendees > 0
      ? Math.round((registered / maxAttendees) * 100)
      : null;
  const open = maxAttendees != null ? Math.max(0, maxAttendees - registered) : null;
  const latestRegMs =
    registeredAt.length > 0 ? Math.max(...registeredAt.map((r) => new Date(r).getTime())) : null;
  const lastSignUpAgo = latestRegMs != null ? relativeTime(nowMs - latestRegMs) : null;
  const closeMs = registrationCloseAt ? new Date(registrationCloseAt).getTime() : null;
  const daysToClose =
    closeMs != null && closeMs > nowMs ? Math.ceil((closeMs - nowMs) / 86_400_000) : null;
  const closeIsPast = closeMs != null && closeMs <= nowMs;

  const meta =
    lifecycle === 'registering'
      ? `open${daysToClose != null ? ` · closes in ${daysToClose}d` : ''}`
      : 'closed · door prep';

  return (
    <SectionShell index="01" title="Registration" meta={meta} metaTone={lifecycle === 'registering' ? 'success' : 'neutral'}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <div>
          {maxAttendees != null && pct != null ? (
            <>
              <p className="font-display text-display text-on-surface">
                {pct}
                <span className="font-title-lg text-title-lg text-on-surface-variant ml-xs">%</span>
              </p>
              <div className="w-full bg-surface-container-highest h-3 rounded-full overflow-hidden mt-sm">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="font-label-md text-label-md text-on-surface-variant mt-xs">
                {registered} of {maxAttendees} registered
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-display text-on-surface">{registered}</p>
              <p className="font-label-md text-label-md text-on-surface-variant mt-xs">
                registered · uncapped
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-sm">
          {open != null && open > 0 && <Stat label="Seats open" value={`${open}`} />}
          {daysToClose != null && (
            <Stat label="Closes in" value={daysToClose === 1 ? '1 day' : `${daysToClose} days`} />
          )}
          {closeIsPast && <Stat label="Registration" value="Closed" />}
          <Stat label="Last sign-up" value={lastSignUpAgo ?? 'Awaiting first registration'} />
          {/* G6: "sent" wording is locked — must not become "delivered". */}
          <Stat label="Confirmations" value={`${confirmationsSent} sent`} />
        </div>
      </div>

      {(lifecycle === 'registering' || lifecycle === 'upcoming') && (
        <div className="mt-lg pt-lg border-t border-outline-variant">
          <RegistrationCloseEditor eventId={eventId} current={registrationCloseAt} />
        </div>
      )}
    </SectionShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{label}</p>
      <p className="font-title-lg text-title-lg text-on-surface">{value}</p>
    </div>
  );
}

function relativeTime(diffMs: number): string {
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
