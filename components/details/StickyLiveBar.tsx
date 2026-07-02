'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Live-only sticky strip — Design Session Log §"For-show vs for-use":
// pinned through scroll, LIVE pulsing pill + event title + elapsed / to-wrap
// + `Open roster →` primary CTA. A SEPARATE element from the toolbar (which
// stays in the header) — never conflated.
export function StickyLiveBar({
  eventId,
  title,
  startMs,
  endMs,
  serverNowMs,
}: {
  eventId: string;
  title: string;
  startMs: number;
  endMs: number;
  serverNowMs: number;
}) {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="sticky top-0 z-40 -mx-grid-margin px-grid-margin mb-lg">
      <div className="flex items-center gap-md h-[44px] px-md rounded-b-[12px] bg-[#0A0A0A] text-white shadow-md">
        <span className="live-pill-pulse inline-flex items-center gap-xs px-sm py-[2px] rounded-full border border-[#4ADE80] text-[#4ADE80] text-[11px] font-bold uppercase tracking-[0.12em]">
          <span aria-hidden>●</span>Live
        </span>
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold">{title}</span>
        <span className="hidden sm:inline text-[12px] tabular-nums text-white/70">
          {fmtDur(now - startMs)} elapsed · {fmtDur(endMs - now)} to wrap
        </span>
        <Link
          href={`/events/${eventId}/checkin`}
          className="inline-flex items-center gap-xs bg-tertiary text-on-tertiary px-md py-[6px] rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]" aria-hidden>group</span>
          Open roster →
        </Link>
      </div>
    </div>
  );
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}
