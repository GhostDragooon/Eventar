import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import { arrivalBuckets } from '@/lib/details/arrivalBuckets';
import { arrivalLatency } from '@/lib/analytics/arrivalLatency';
import { SectionShell, SectionStub } from './SectionChrome';

export type CheckInRecord = { at: string | null; method: string | null };

type Props = {
  lifecycle: Lifecycle;
  registered: number;
  attended: number;
  checkIns: CheckInRecord[];
  startTime: string;
  endTime: string;
  timezone: string;
  nowMs: number;
  // Section-scoped operations (e.g. "Send reminders now" while live).
  actionSlot?: React.ReactNode;
};

// Section 02 — Attendance. One-line stub until the door opens; live = the
// operator view (checked-in split + arrivals histogram); completed keeps the
// wrap-up stats + the final histogram.
export function AttendanceSection({
  lifecycle,
  registered,
  attended,
  checkIns,
  startTime,
  endTime,
  timezone,
  nowMs,
  actionSlot,
}: Props) {
  const startMs = new Date(startTime).getTime();
  const doorOpenMs = startMs - CHECKIN_OPEN_MINUTES * 60_000;

  if (lifecycle === 'drafted' || lifecycle === 'registering' || lifecycle === 'upcoming') {
    return (
      <SectionStub
        index="02"
        title="Attendance"
        detail={`opens ${fmtDay(startTime, timezone)}`}
        meta={countdown(doorOpenMs - nowMs)}
      />
    );
  }
  if (lifecycle === 'cancelled') {
    return <SectionStub index="02" title="Attendance" detail="cancelled — door never opened" />;
  }

  const qr = checkIns.filter((c) => c.at && c.method === 'qr').length;
  const manual = checkIns.filter((c) => c.at && c.method === 'manual').length;
  const untilMs = lifecycle === 'live' ? nowMs : new Date(endTime).getTime();
  const hist = arrivalBuckets(checkIns.map((c) => c.at), doorOpenMs, untilMs);

  const meta =
    lifecycle === 'live' ? `Live · ${attended} of ${registered} checked in` : `final · ${attended} of ${registered}`;

  return (
    <SectionShell index="02" title="Attendance" meta={meta} metaTone={lifecycle === 'live' ? 'success' : 'neutral'}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-lg items-start">
        {/* Split: total / QR / manual */}
        <div className="flex flex-col gap-sm">
          <SplitRow n={attended} of={registered} unit="" label="Checked in" strong />
          {/* "By QR", not "Self-scan": check_in_method='qr' is written by BOTH
              a staff camera scan and an attendee's self-serve tap, so naming it
              after one of them mislabels the other. The roster already says
              plain "QR"; these two screens now agree. Splitting the two apart
              needs a distinct method value — a data-model change, flagged for
              Ivan rather than guessed at here. */}
          <SplitRow n={qr} unit="QR" label="By QR" />
          <SplitRow n={manual} unit="manual" label="Reception" />
          {/* No Open-roster button here — the toolbar (for-use) and the live
              sticky bar already carry it; a third copy was noise. */}
          {actionSlot && <div className="mt-sm">{actionSlot}</div>}
        </div>

        {/* Arrivals histogram */}
        <div className="bg-surface-container-low border border-outline-variant rounded-[14px] p-md">
          <div className="flex items-baseline justify-between mb-sm">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Arrivals per {hist.bucketMinutes} min
            </p>
            <p className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
              since door open
            </p>
          </div>
          {hist.peakIndex == null ? (
            <p className="font-body-md text-body-md text-on-surface-variant py-lg text-center">No arrivals yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-[88px]" aria-hidden>
                {hist.buckets.map((n, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t-[2px] bg-[color:var(--success)] min-w-[2px]"
                    style={{ height: n === 0 ? '2px' : `${Math.max(8, Math.round((n / hist.peakCount) * 100))}%`, opacity: n === 0 ? 0.25 : 1 }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-xs font-label-md text-label-md text-on-surface-variant normal-case tracking-normal tabular-nums">
                <span>{fmtHM(doorOpenMs, timezone)}</span>
                <span className="text-[color:var(--success)] font-semibold">
                  peak {fmtHM(doorOpenMs + hist.peakIndex * hist.bucketMinutes * 60_000, timezone)} · {hist.peakCount} arrival{hist.peakCount === 1 ? '' : 's'}
                </span>
                <span>{fmtHM(untilMs, timezone)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {lifecycle === 'completed' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mt-lg pt-lg border-t border-outline-variant">
          <Stat label="Show-up rate" value={`${registered > 0 ? Math.round((attended / registered) * 100) : 0}%`} />
          <Stat label="Funnel" value={`${registered} → ${attended}`} />
          <Stat
            label="On-time arrival"
            value={(() => {
              const onTime = arrivalLatency(checkIns.map((c) => ({ check_in_at: c.at })), startTime);
              return onTime == null ? '—' : `${Math.round(onTime * 100)}%`;
            })()}
          />
        </div>
      )}
    </SectionShell>
  );
}

function SplitRow({ n, of, unit, label, strong }: { n: number; of?: number; unit: string; label: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-sm border border-outline-variant rounded-[12px] px-md py-sm">
      <span className={`font-extrabold tabular-nums tracking-[-0.02em] ${strong ? 'text-[calc(26px*var(--text-scale))] text-[color:var(--success)]' : 'text-[calc(20px*var(--text-scale))] text-on-surface'}`} style={{ lineHeight: 1 }}>
        {n}
      </span>
      {of != null && <span className="text-body-md text-on-surface-variant">/ {of}</span>}
      {unit && <span className="text-body-md text-on-surface-variant">{unit}</span>}
      <span className="ml-auto font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{label}</span>
    </div>
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

function fmtDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function fmtHM(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(ms);
}
function countdown(deltaMs: number): string | undefined {
  if (deltaMs <= 0) return undefined;
  const totalH = Math.floor(deltaMs / 3_600_000);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  if (d > 0) return `${d}d ${h}h to door`;
  const m = Math.floor((deltaMs % 3_600_000) / 60_000);
  return `${h}h ${m}m to door`;
}
