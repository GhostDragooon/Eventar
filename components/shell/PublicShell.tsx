import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { StaffProgrammePill } from './StaffProgrammePill';

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
  signedIn = false,
  isStaff = false,
  accountComplete = false,
  unlinkedCount = 0,
}: {
  children: React.ReactNode;
  pill?: PublicShellPill;
  /**
   * Whether the visitor is signed in. Drives the right-side auth CTA — mirror
   * of SiteShell's state-aware pill (commit 9b0412f). Attendee door for
   * signed-out, the Account disclosure menu (or Programme pill when isStaff)
   * for signed-in; staff /login stays unlinked from public chrome per Q32's
   * audience-boundary rule. Same shape and default as SiteShell (false when
   * a caller can't know).
   */
  signedIn?: boolean;
  /**
   * Whether the signed-in caller is an organiser (staff session). Ivan
   * 2026-09-24: organisers have no attendee identity — render
   * StaffProgrammePill instead of AccountMenu, giving them a route back to
   * /dashboard rather than attendee-flavored chrome. Ignored when signedIn
   * is false.
   */
  isStaff?: boolean;
  /** Picks the Account menu's item set — see SiteShell's same prop. Ignored when isStaff. */
  accountComplete?: boolean;
  /** Shows "Claim past events" in the menu only when > 0. Ignored when isStaff. */
  unlinkedCount?: number;
}) {
  return (
    <div className="app-atmo flex min-h-screen flex-col text-on-surface">
      <nav
        aria-label="Primary"
        className="glass-nav sticky top-[10px] z-[5] mx-[18px] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm"
      >
        <BrandMark />

        {/* Short/long label below sm (2026-09-23 user-lens, SiteShell parity):
            the Account control's shrink-0 now claims a guaranteed width on
            this shell too, leaving less room for this link at 375px. */}
        <Link
          href="/events"
          className="nav-item shrink-0 whitespace-nowrap rounded-full px-[11px] py-[7px] text-[calc(13px*var(--text-scale))] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="sm:hidden">Events</span>
          <span className="hidden sm:inline">Upcoming events</span>
        </Link>

        <div className="flex items-center gap-sm">
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

          {signedIn ? (
            isStaff ? (
              <StaffProgrammePill />
            ) : (
              <AccountMenu complete={accountComplete} unlinkedCount={unlinkedCount} />
            )
          ) : (
            <Link
              href="/account/sign-in"
              className="rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <main className="w-full flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
