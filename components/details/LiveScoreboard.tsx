'use client';

import { useEffect, useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// The Event Manager's dark "scoreboard" — the one maximalist moment on the
// staff side. Live: elapsed / wraps-in countdown that ticks. Upcoming: starts-in.
// Completed: final tallies. Three stat tiles read registered / attended /
// responses. Green = live/go throughout (instructional color).
export function LiveScoreboard({
  lifecycle,
  startMs,
  endMs,
  serverNowMs,
  startLabel,
  endLabel,
  registered,
  capacity,
  attended,
  responses,
}: {
  lifecycle: Lifecycle;
  startMs: number;
  endMs: number;
  serverNowMs: number; // seeds first paint so SSR + hydration agree; client ticks after mount
  startLabel: string;
  endLabel: string;
  registered: number;
  capacity: number | null;
  attended: number;
  responses: number;
}) {
  const [now, setNow] = useState(serverNowMs);
  const isLive = lifecycle === 'live';
  const isUpcoming = lifecycle === 'registering' || lifecycle === 'upcoming';
  const isDone = lifecycle === 'completed' || lifecycle === 'cancelled';

  // Tick each second only while the numbers are actually moving (live/upcoming).
  useEffect(() => {
    if (isDone) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isDone]);

  const total = Math.max(1, endMs - startMs);
  const pct = Math.min(100, Math.max(0, Math.round(((now - startMs) / total) * 100)));
  const nowLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(now);

  const elapsed = fmtDur(now - startMs);
  const wrapsIn = fmtDur(endMs - now);
  const startsIn = fmtDur(startMs - now);

  // Left/right headline pair varies by state.
  let leftK = 'ELAPSED', leftV = elapsed, rightK = 'WRAPS IN', rightV = wrapsIn;
  if (isUpcoming) { leftK = 'STARTS IN'; leftV = startsIn; rightK = 'RUNS FOR'; rightV = fmtDur(total); }
  else if (isDone) { leftK = 'STATUS'; leftV = lifecycle === 'cancelled' ? 'Cancelled' : 'Wrapped'; rightK = 'DURATION'; rightV = fmtDur(total); }

  const accent = isLive ? 'text-[#4ADE80]' : 'text-white';

  return (
    <section
      className="rounded-[20px] p-lg mb-xl text-white relative overflow-hidden"
      style={{ background: 'radial-gradient(120% 140% at 0% 0%, #123420 0%, #0A0A0A 55%)' }}
      aria-label="Event status"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 mb-md">Status</p>

      <div className="flex flex-wrap items-baseline gap-x-xl gap-y-sm mb-md">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 mr-md align-middle">{leftK}</span>
          <span className={`text-[34px] font-extrabold tracking-[-0.02em] tabular-nums align-middle ${accent}`}>{leftV}</span>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 mr-md align-middle">{rightK}</span>
          <span className="text-[34px] font-extrabold tracking-[-0.02em] tabular-nums align-middle text-white">{rightV}</span>
        </div>
      </div>

      {/* Progress rail (only meaningful while running) */}
      {!isDone && (
        <>
          <div className="h-[6px] w-full rounded-full bg-white/10 overflow-hidden mb-xs" aria-hidden>
            <div className="h-full rounded-full bg-[#4ADE80] transition-[width] duration-1000 ease-linear" style={{ width: `${isUpcoming ? 0 : pct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] tabular-nums text-white/50 mb-lg">
            <span>{startLabel} start</span>
            <span className={isLive ? 'text-[#4ADE80]' : ''}>{nowLabel} now</span>
            <span>{endLabel} end</span>
          </div>
        </>
      )}

      {/* Three stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
        <StatTile n={registered} of={capacity} label="Registered" sub={registered > 0 && (lifecycle === 'completed' || lifecycle === 'live') ? 'closed' : lifecycle === 'drafted' ? 'draft' : 'open'} />
        <StatTile n={attended} of={registered || null} label="Attended" sub={isLive ? 'live' : isDone ? 'final' : 'pending'} highlight={isLive} />
        <StatTile n={responses} label="Responses" sub="feedback" />
      </div>
    </section>
  );
}

function StatTile({ n, of, label, sub, highlight }: { n: number; of?: number | null; label: string; sub: string; highlight?: boolean }) {
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.03] p-md">
      <p className="leading-none mb-sm">
        <span className={`text-[30px] font-extrabold tracking-[-0.02em] tabular-nums ${highlight ? 'text-[#4ADE80]' : 'text-white'}`}>{n}</span>
        {of != null && <span className="text-body-md text-white/40"> / {of}</span>}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}<span className="text-white/30"> · {sub}</span>
      </p>
    </div>
  );
}

// "01h 23m" / "6m 14s"-style compact duration from a ms delta (never negative).
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}
