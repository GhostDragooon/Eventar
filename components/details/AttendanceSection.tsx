import Link from 'next/link';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { arrivalLatency } from '@/lib/analytics/arrivalLatency';

type Props = {
  lifecycle: Lifecycle;
  eventId: string;
  registered: number;
  attended: number;
  checkIns: (string | null)[];
  startTime: string;
};

export function AttendanceSection({
  lifecycle,
  eventId,
  registered,
  attended,
  checkIns,
  startTime,
}: Props) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg">
      <div className="flex items-center gap-sm mb-md">
        <span
          className="material-symbols-outlined text-primary bg-primary-container p-xs rounded-md"
          aria-hidden
        >
          how_to_reg
        </span>
        <h2 className="font-title-lg text-title-lg text-on-surface">Attendance</h2>
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
            className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
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
