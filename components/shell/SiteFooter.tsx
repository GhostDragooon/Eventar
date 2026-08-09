import Link from 'next/link';

/**
 * The one footer, used by every shell.
 *
 * Ivan 2026-08-09: "consistent top and bottom nav bar throughout." The top was
 * unified onto `.glass-nav` first; the bottom was still two different things —
 * the landing had a real footer with links, while SiteShell, PublicShell and
 * StaffShell each rendered their own thin "By Eventar" band with no navigation
 * at all. Same bug as the four navs, one storey down.
 *
 * The footer carries a brand mark, and since 2026-08-09 so does every shell's
 * chrome — Ivan retired the "no wordmark in shell chrome" rule across all four.
 * This comment used to say the mark lived "HERE and only here"; that stopped
 * being true when the organiser sidebar got its mark back, and stayed written
 * for a day. The shared definition is `components/shell/BrandMark.tsx`.
 *
 * `links` is off for staff surfaces: an operator inside the app does not need
 * marketing anchors, and the landing anchors would be dead links from /dashboard
 * anyway — the failure mode this whole pass exists to remove.
 */
export function SiteFooter({ links = true }: { links?: boolean }) {
  return (
    <footer className="mt-xxl w-full border-t border-outline-variant px-lg py-xl">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-between gap-md">
        <p className="text-[calc(12.5px*var(--text-scale))] text-on-surface-variant">
          By <span className="font-bold text-on-surface">Eventar</span> · CPD infrastructure, Hong Kong
        </p>

        {links && (
          <nav aria-label="Footer" className="flex flex-wrap gap-lg">
            {/* Cross-page, so these are real routes with a hash, not bare
                anchors: a bare "#how-it-works" from /events resolves against
                /events and goes nowhere. */}
            <Link
              href="/#how-it-works"
              className="nav-item text-[calc(12.5px*var(--text-scale))] text-on-surface-variant hover:text-on-surface"
            >
              How it works
            </Link>
            <Link
              href="/#platform"
              className="nav-item text-[calc(12.5px*var(--text-scale))] text-on-surface-variant hover:text-on-surface"
            >
              Platform
            </Link>
            <Link
              href="/events"
              className="nav-item text-[calc(12.5px*var(--text-scale))] text-on-surface-variant hover:text-on-surface"
            >
              Upcoming events
            </Link>
          </nav>
        )}
      </div>
    </footer>
  );
}
