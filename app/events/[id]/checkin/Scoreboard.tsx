'use client';

import { useEffect, useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { startsInLabel } from '@/lib/lifecycle/startsInLabel';

/**
 * TC scoreboard — the door tablet's dark status band (locked TC spec:
 * "full-screen scoreboard, biggest countdown"). Same dark family as the
 * Event Manager scoreboard so the staff surfaces share one design language:
 * STATUS eyebrow · dominant countdown · green checked-in fraction + rail.
 * Countdown ticks every 60s — a tablet runs for hours, so a stale label is
 * a real bug.
 */
export function Scoreboard({
  lifecycle,
  startMs,
  attended,
  registered,
}: {
  lifecycle: Lifecycle;
  startMs: number;
  attended: number;
  registered: number;
}) {
  // Hydration safety: render the SSR-derived now once, then bump locally.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const pct = registered > 0 ? Math.min(100, (attended / registered) * 100) : 0;
  const countdown = startsInLabel(startMs, nowMs);
  const isLive = lifecycle === 'live';

  return (
    <section
      aria-label="Check-in scoreboard"
      className="rounded-[20px] p-lg text-white"
      style={{ background: 'radial-gradient(120% 140% at 0% 0%, #123420 0%, #0A0A0A 55%)' }}
    >
      <div className="flex items-center justify-between mb-md">
        <p className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[0.18em] text-white/50">Status</p>
        <span
          className={`inline-flex items-center gap-xs px-sm py-[2px] rounded-full border text-[calc(11px*var(--text-scale))] font-bold uppercase tracking-[0.12em] ${
            isLive ? 'border-[#4ADE80] text-[#4ADE80] live-pill-pulse' : 'border-white/25 text-white/70'
          }`}
        >
          <span aria-hidden>●</span>
          {isLive ? 'Live' : lifecycle === 'upcoming' ? 'Door prep' : 'Not open yet'}
        </span>
      </div>

      {/* Biggest element on the page: the start countdown. */}
      <p
        className="text-[calc(44px*var(--text-scale))] leading-none font-extrabold tracking-[-0.03em] tabular-nums mb-lg"
        aria-live="polite"
      >
        {countdown}
      </p>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <p className="leading-none">
          <span className={`text-[calc(34px*var(--text-scale))] font-extrabold tracking-[-0.02em] tabular-nums ${isLive ? 'text-[#4ADE80]' : 'text-white'}`}>
            {attended}
          </span>
          <span className="text-body-md text-white/40"> / {registered} checked in</span>
        </p>
        <p className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[0.14em] text-white/50">
          Attendance · {isLive ? 'live' : 'pending'}
        </p>
      </div>

      <div
        className="mt-sm w-full bg-white/10 h-[6px] rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${attended} of ${registered} checked in`}
      >
        <div
          className="bg-[#4ADE80] h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
