'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Live-only sticky strip — Design Session Log §"For-show vs for-use":
// carries the live state + primary CTA THROUGH SCROLL. At rest the header +
// scoreboard already show all of this, so the bar only fades in once the
// sentinel (mounted where the component sits, above the header) scrolls out
// of view — no duplicated chrome at the top of the page, no overhang.
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
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // The sentinel sits at the top of the page content. Expanding the
        // root 160px UPWARD keeps it "intersecting" until the header (title
        // + pill) has scrolled past the top — only then does the bar slide
        // in, so its LIVE pill/title never duplicate the visible header.
        // 160 (not more) keeps the pin reachable on short live pages where
        // the sections are one-line stubs. (A negative top margin would
        // invert this and pin the bar at rest.)
        setPinned(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '160px 0px 0px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* In-flow scroll sentinel at the component's mount point (top of the
          page content). Once it scrolls above the viewport, the bar pins. */}
      <div ref={sentinelRef} aria-hidden className="h-0 w-full pointer-events-none" />

      <div
        // Sits BELOW the shell nav, not over it. This was `top-0 z-40` against
        // a non-sticky staff top bar, so by the time the bar pinned the bar it
        // would have covered had already scrolled away. StaffShell's nav is now
        // a STICKY pill at y 10-62, so `top-0` parked an opaque strip on top of
        // Dashboard / Check-in / Analytics / Settings and the back link for the
        // entire live window — the one window where an operator most needs them.
        className={`fixed inset-x-0 top-[72px] z-[4] transition-transform duration-200 ${
          // -300%, not -full: parked at top-[72px] the bar must clear its own
          // height AND the 72px offset, or a sliver stays visible under the nav.
          pinned ? 'translate-y-0' : '-translate-y-[300%]'
        }`}
        aria-hidden={!pinned}
      >
        <div className="flex items-center gap-md h-[44px] px-grid-margin bg-[#0A0A0A] text-white shadow-md">
          <span className="live-pill-pulse inline-flex items-center gap-xs px-sm py-[2px] rounded-full border border-[#4ADE80] text-[#4ADE80] text-[calc(11px*var(--text-scale))] font-bold uppercase tracking-[0.12em]">
            <span aria-hidden>●</span>Live
          </span>
          <span className="flex-1 min-w-0 truncate text-[calc(13px*var(--text-scale))] font-semibold">{title}</span>
          <span className="hidden sm:inline text-[calc(12px*var(--text-scale))] tabular-nums text-white/70">
            {fmtDur(now - startMs)} elapsed · {fmtDur(endMs - now)} to wrap
          </span>
          <Link
            href={`/events/${eventId}/checkin`}
            tabIndex={pinned ? 0 : -1}
            className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-[6px] rounded-full text-[calc(12px*var(--text-scale))] font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            <span className="material-symbols-outlined text-[calc(15px*var(--text-scale))]" aria-hidden>group</span>
            Open roster →
          </Link>
        </div>
      </div>
    </>
  );
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}
