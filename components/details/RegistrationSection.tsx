import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import type { SectionState } from '@/lib/lifecycle/sectionState';
import { RegistrationCloseEditor } from './RegistrationCloseEditor';

type Props = {
  eventId: string;
  registered: number;
  maxAttendees: number | null;
  registrationCloseAt: string | null;
  registeredAt: string[];
  nowMs: number;
  lifecycle: Lifecycle;
  state: SectionState;
  // G6: count of confirmation emails actually delivered (email_log.status='sent').
  // Word "sent" matters — copy must never say "delivered".
  confirmationsSent: number;
};

export function RegistrationSection({
  eventId,
  registered,
  maxAttendees,
  registrationCloseAt,
  registeredAt,
  nowMs,
  lifecycle,
  state,
  confirmationsSent,
}: Props) {
  if (lifecycle === 'drafted') {
    return (
      <SectionCard title="Registration" icon="how_to_reg" state={state}>
        <p className="font-body-md text-body-md text-on-surface-variant">Publish to begin registration.</p>
      </SectionCard>
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

  return (
    <SectionCard title="Registration" icon="how_to_reg" state={state}>
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
          <Stat label="Last sign-up" value={lastSignUpAgo ?? lastSignUpEmptyCopy(lifecycle)} />
          {/* G6: "sent" wording is locked — must not become "delivered". */}
          <Stat label="Confirmations" value={`${confirmationsSent} sent`} />
        </div>
      </div>

      {(lifecycle === 'registering' || lifecycle === 'upcoming') && (
        <div className="mt-lg pt-lg border-t border-outline-variant">
          <RegistrationCloseEditor eventId={eventId} current={registrationCloseAt} />
        </div>
      )}
    </SectionCard>
  );
}

function SectionCard({
  title,
  icon,
  state,
  children,
}: {
  title: string;
  icon: string;
  state: SectionState;
  children: React.ReactNode;
}) {
  // patterns §7a — monochrome ladder. Active = accent ring (the one moment of
  // color on the cards). Done = neutral surface, no ring. Locked = dimmed.
  const wrapperClass =
    state === 'active'
      ? 'bg-surface-container-lowest border-2 border-primary rounded-[20px] p-lg shadow-sm mb-lg'
      : state === 'locked'
        ? 'bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg opacity-60'
        : 'bg-surface-container-low border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg';
  return (
    <section className={wrapperClass}>
      <div className="flex items-center gap-sm mb-md">
        <span
          className="material-symbols-outlined text-primary bg-primary-container p-xs rounded-md"
          aria-hidden
        >
          {icon}
        </span>
        <h2 className="font-title-lg text-title-lg text-on-surface">{title}</h2>
      </div>
      {children}
    </section>
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

// "Awaiting first registration" reads as forward-looking — wrong on a
// completed or cancelled event where the window has closed. U-LIVE #2.
function lastSignUpEmptyCopy(lifecycle: Lifecycle): string {
  if (lifecycle === 'completed' || lifecycle === 'cancelled') {
    return 'No registrations received';
  }
  return 'Awaiting first registration';
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
