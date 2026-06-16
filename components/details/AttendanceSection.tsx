import Link from 'next/link';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import type { SectionState } from '@/lib/lifecycle/sectionState';
import { arrivalLatency } from '@/lib/analytics/arrivalLatency';

type Props = {
  lifecycle: Lifecycle;
  state: SectionState;
  eventId: string;
  registered: number;
  attended: number;
  checkIns: (string | null)[];
  startTime: string;
};

export function AttendanceSection({
  lifecycle,
  state,
  eventId,
  registered,
  attended,
  checkIns,
  startTime,
}: Props) {
  // patterns §7a — monochrome ladder + §9 "Scanning live" anchors top-LEFT
  // (after the medallion, before the chip slot — replaces the prior top-right
  // placement that the sweep note in §9 called out).
  const wrapperClass =
    state === 'active'
      ? 'bg-surface-container-lowest border-2 border-primary rounded-[20px] p-lg shadow-sm mb-lg'
      : state === 'locked'
        ? 'bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg opacity-60'
        : 'bg-surface-container-low border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg';

  return (
    <section className={wrapperClass}>
      <div className="flex items-center gap-sm mb-md flex-wrap">
        <span
          className="material-symbols-outlined text-primary bg-primary-container p-xs rounded-md"
          aria-hidden
        >
          how_to_reg
        </span>
        <h2 className="font-title-lg text-title-lg text-on-surface">Attendance</h2>
        {lifecycle === 'live' && (
          // §9: top-LEFT, on the same row as the heading. §7a green is the only
          // place green appears outside the lifecycle pill — it migrates here
          // for the actively-scanning card.
          <span
            className="live-pill-pulse inline-flex items-center gap-xs bg-success text-on-success px-sm py-[2px] rounded-full font-label-md text-label-md"
            aria-live="polite"
          >
            <span aria-hidden>●</span>
            Scanning live
          </span>
        )}
      </div>

      {lifecycle === 'live' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
          <div>
            <p className="font-display text-display text-on-surface">
              {attended}
              <span className="font-title-lg text-title-lg text-on-surface-variant ml-xs">
                of {registered}
              </span>
            </p>
            <p className="font-label-md text-label-md text-on-surface-variant mt-xs">
              checked in right now
            </p>
          </div>
          <Link
            href={`/events/${eventId}/checkin`}
            className="flex items-center gap-sm bg-tertiary text-on-tertiary px-lg py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              group
            </span>
            Open roster
          </Link>
        </div>
      )}

      {lifecycle === 'completed' && (() => {
        const showUpPct = registered > 0 ? Math.round((attended / registered) * 100) : 0;
        const onTime = arrivalLatency(
          checkIns.map((c) => ({ check_in_at: c })),
          startTime,
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                Show-up rate
              </p>
              <p className="font-display text-display text-on-surface">{showUpPct}%</p>
            </div>
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                Funnel
              </p>
              <p className="font-title-lg text-title-lg text-on-surface">
                {registered} <span className="text-on-surface-variant">→</span> {attended}
              </p>
            </div>
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                On-time arrival
              </p>
              <p className="font-title-lg text-title-lg text-on-surface">
                {onTime == null ? '—' : `${Math.round(onTime * 100)}%`}
              </p>
            </div>
          </div>
        );
      })()}

      {lifecycle !== 'live' && lifecycle !== 'completed' && (
        <p className="font-body-md text-body-md text-on-surface-variant">
          Attendance opens when event goes live.
        </p>
      )}
    </section>
  );
}
