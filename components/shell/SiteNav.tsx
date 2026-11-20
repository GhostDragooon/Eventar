'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { StaffProgrammePill } from './StaffProgrammePill';
import { useScrollFade } from '@/lib/useScrollFade';

// The one top nav for every public and auth page (Ivan, 2026-11-20): SiteShell,
// PublicShell and LandingNav all render this, so the items and their order cannot
// drift between surfaces. Glass pill: brand | Upcoming events | Organiser log in |
// auth CTA. No "Home" item (the brand mark is home).
//
// An item that points at the current page renders as a <span aria-current="page">,
// not a link, so no page links to itself. The brand mark stays a link.
//
// whitespace-nowrap + shrink-0 keep each label intact at 375px; the item group's
// overflow-x-auto is the safety net (user-lens 2026-09-19).
const NAV_ITEM =
  'nav-item tap-44 inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-[11px] py-[7px] text-[calc(0.8125rem*var(--text-scale))] font-medium';
const NAV_IDLE = 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';
const NAV_ACTIVE = 'bg-surface-container-high font-semibold text-on-surface';
const PILL =
  'tap-44 shrink-0 whitespace-nowrap rounded-full bg-primary px-md py-[7px] text-[calc(0.78125rem*var(--text-scale))] font-semibold text-on-primary';
const PILL_MOTION =
  'transition-[translate,scale] duration-150 ease-out hover:-translate-y-px active:scale-[.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export type SiteNavActive = 'events' | 'organiser' | 'signin' | 'account';

export type SiteNavProps = {
  active?: SiteNavActive;
  /** Visitor is signed in: shows the Account menu (or Programme pill for staff) instead of the Log in pill. */
  signedIn?: boolean;
  /** Signed-in staff session: StaffProgrammePill instead of AccountMenu. */
  isStaff?: boolean;
  accountComplete?: boolean;
  unlinkedCount?: number;
  /** Where the signed-out "Log in" pill goes. When set, the separate "Organiser log in" item is omitted (the pill is that door). */
  loginHref?: string;
  /** Replaces the whole right-hand auth control (the landing's client island, which resolves the session itself). */
  authSlot?: React.ReactNode;
  /** Extra node beside the auth control (PublicShell's state pill). */
  beforeAuth?: React.ReactNode;
  /** Positioning classes; default is the shell's 18px side margin. */
  className?: string;
};

export function SiteNav({
  active,
  signedIn = false,
  isStaff = false,
  accountComplete = false,
  unlinkedCount = 0,
  loginHref,
  authSlot,
  beforeAuth,
  className = 'mx-[18px]',
}: SiteNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  useScrollFade(navRef);

  return (
    <nav
      aria-label="Primary"
      className={`glass-nav sticky top-[10px] z-[5] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm ${className}`}
    >
      <div className="shrink-0">
        <BrandMark href={signedIn && !isStaff ? '/events' : '/'} hideWordmarkOnPhone />
      </div>

      {/* min-w-0 + overflow-x-auto: brand and CTA never shrink; this group scrolls if it must.
          "Upcoming events" -> "Events" below sm: the overflow fallback has no visible affordance on mobile. */}
      <div ref={navRef} className="scroll-fade -my-[5px] flex min-w-0 items-center gap-[2px] overflow-x-auto py-[5px]">
        {active === 'events' ? (
          <span aria-current="page" className={`${NAV_ITEM} ${NAV_ACTIVE}`}>
            <span className="sm:hidden"><span className="reserve-bold" data-text="Events">Events</span></span>
            <span className="hidden sm:inline"><span className="reserve-bold" data-text="Upcoming events">Upcoming events</span></span>
          </span>
        ) : (
          <Link href="/events" className={`${NAV_ITEM} ${NAV_IDLE}`}>
            <span className="sm:hidden"><span className="reserve-bold" data-text="Events">Events</span></span>
            <span className="hidden sm:inline"><span className="reserve-bold" data-text="Upcoming events">Upcoming events</span></span>
          </Link>
        )}
        {/* Organiser door (doctrine section 1). Short label below sm so phone visitors still reach /login; the sr-only tail keeps the accessible name containing the visible word (WCAG 2.5.3). */}
        {!signedIn &&
          !loginHref &&
          (active === 'organiser' ? (
            <span aria-current="page" className={`${NAV_ITEM} ${NAV_ACTIVE}`}>
              <span className="sm:hidden">Organisers<span className="sr-only"> log in</span></span><span className="hidden sm:inline">Organiser log in</span>
            </span>
          ) : (
            <Link href="/login" className={`${NAV_ITEM} ${NAV_IDLE}`}>
              <span className="sm:hidden">Organisers<span className="sr-only"> log in</span></span><span className="hidden sm:inline">Organiser log in</span>
            </Link>
          ))}
      </div>

      <div className="flex shrink-0 items-center gap-sm">
        {beforeAuth}
        {authSlot ??
          (signedIn ? (
            isStaff ? (
              <StaffProgrammePill />
            ) : (
              <AccountMenu complete={accountComplete} unlinkedCount={unlinkedCount} active={active === 'account'} />
            )
          ) : active === 'signin' ? (
            <span aria-current="page" className={`${PILL} opacity-90`}>
              Log in
            </span>
          ) : (
            <Link href={loginHref ?? '/account/sign-in'} className={`${PILL} ${PILL_MOTION}`}>
              Log in
            </Link>
          ))}
      </div>
    </nav>
  );
}
