'use client';

import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { startsInLabel } from '@/lib/lifecycle/startsInLabel';

/**
 * TC scoreboard (E.4): status pill top-left, large attended/registered
 * fraction, progress bar, live "Starts in Xm" / "Started Xm ago" countdown
 * derived from start_time. Countdown ticks every 60s — a tablet runs for
 * hours, so a stale label is a real bug.
 *
 * G10: doors-open phrase intentionally omitted (the lifecycle pill already
 * carries the operational state).
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
  // (The page-level lifecycle is server-derived; we accept up to ~60s drift
  // on the countdown after mount.)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const pct = registered > 0 ? Math.min(100, (attended / registered) * 100) : 0;
  const countdown = startsInLabel(startMs, nowMs);

  return (
    <section
      aria-label="Check-in scoreboard"
      className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-md mb-md">
        <div>
          <div className="mb-sm">
            <StatusPill lifecycle={lifecycle} />
          </div>
          <p className="font-label-md text-label-md uppercase text-on-surface-variant">
            Checked in
          </p>
          <p className="mt-xs">
            <span className="font-headline-lg text-headline-lg text-tertiary">
              {attended}
            </span>
            <span className="ml-sm font-body-md text-body-md text-on-surface-variant">
              of {registered}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-label-md text-label-md uppercase text-on-surface-variant">
            Start
          </p>
          <p
            className="mt-xs font-headline-sm text-headline-sm text-tertiary"
            aria-live="polite"
          >
            {countdown}
          </p>
        </div>
      </div>

      <div
        className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${attended} of ${registered} checked in`}
      >
        <div
          className="bg-tertiary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
