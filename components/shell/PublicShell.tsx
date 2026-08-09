import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';

// Attendee-surface shell (check-in pass, survey, public event page, register).
//
// 2026-08-08 (Ivan): one design language across every surface. Previously a
// bordered edge-to-edge bar with two empty grid cells and an optional state
// pill floating at the right — structurally the staff nav with the contents
// deleted, which is why an attendee arriving from an email landed on
// something that looked unrelated to the site the QR came from.
//
// Now the same floating glass pill as the landing and SiteShell, over the
// quiet `.app-atmo` ground.
//
// The pill always carries ONE link out. The old shell's left and centre cells
// were deliberately empty ("attendees arrive from email links; no back
// navigation"), which is true right up until something goes wrong: /survey
// with no code renders "No survey code" with no control anywhere on the page,
// so a practitioner whose link expired has literally nowhere to click. That is
// a dead end, not minimalism. "Upcoming events" is a real destination that is
// useful to exactly the person who lands here by accident.
//
// WORDMARK: present, as of 2026-08-09 (Ivan) — the old "no wordmark in shell
// chrome" rule is retired across all four shells. This comment previously
// claimed the rule was "shared with SiteShell/StaffShell" while StaffShell had
// already abandoned it, which is the kind of stale cross-reference that makes a
// retired rule look live.

export type PublicShellPill = {
  label: string;
  tone: 'success' | 'neutral';
};

export function PublicShell({
  children,
  pill,
}: {
  children: React.ReactNode;
  pill?: PublicShellPill;
}) {
  return (
    <div className="app-atmo flex min-h-screen flex-col text-on-surface">
      <nav
        aria-label="Primary"
        className="glass-nav sticky top-[10px] z-[5] mx-[18px] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm"
      >
        <BrandMark />

        <Link
          href="/events"
          className="nav-item rounded-full px-[11px] py-[7px] text-[calc(13px*var(--text-scale))] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          Upcoming events
        </Link>

        {pill && (
          <span
            className={`inline-flex items-center gap-xs rounded-full px-sm py-[3px] text-[calc(11px*var(--text-scale))] font-semibold ${
              pill.tone === 'success'
                ? 'bg-success-container text-on-success-container'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            <span
              className={`h-[6px] w-[6px] rounded-full ${
                pill.tone === 'success' ? 'bg-[color:var(--success)]' : 'bg-outline'
              }`}
              aria-hidden
            />
            {pill.label}
          </span>
        )}
      </nav>

      <main className="w-full flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
