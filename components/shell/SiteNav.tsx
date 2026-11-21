'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { StaffProgrammePill } from './StaffProgrammePill';
import { useScrollFade } from '@/lib/useScrollFade';

// The one top nav for every public and auth page (Ivan, 2026-11-20): SiteShell,
// PublicShell and LandingNav all render this, so the items and their order cannot
// drift between surfaces. Glass pill: brand | Upcoming events |
// auth CTA (the landing sets loginHref, so its one pill is the organiser door while its toggle is on Organiser). No organiser item
// (Ivan 2026-11-22: the landing pill separates attendee and organiser paths). No "Home" item (the brand mark is home).
//
// An item that points at the current page renders as a <span aria-current="page">,
// not a link, so no page links to itself. The brand mark stays a link.
//
// whitespace-nowrap + shrink-0 keep each label intact at 375px; the item group's
// overflow-x-auto is the safety net (user-lens 2026-09-19).
const NAV_ITEM =
  'nav-item tap-44 inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-[0.6875rem] max-[22.5rem]:px-sm py-[0.4375rem] text-[calc(0.8125rem*var(--text-scale))] font-medium';
const NAV_IDLE = 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';
// Phone only (Ivan 2026-11-21): the bottom pill is two equal halves, Events and the login door. The web nav is unchanged.
const HALF = 'max-sm:flex-1 max-sm:justify-center';
const NAV_ACTIVE = 'bg-surface-container-high font-semibold text-on-surface';
// At 320px "Organiser log in" is wider than half the pill, so the halves came out 121 vs 127; tighter padding there keeps them equal.
const PILL =
  'tap-44 shrink-0 max-sm:flex-1 max-sm:text-center whitespace-nowrap rounded-full bg-primary px-md max-[22.5rem]:px-sm py-[0.4375rem] text-[calc(0.78125rem*var(--text-scale))] font-semibold text-on-primary';
const PILL_MOTION =
  'transition-[translate,scale] duration-150 ease-out hover:-translate-y-px active:scale-[.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export type SiteNavActive = 'events' | 'signin' | 'account' | 'about' | 'plan';

// Web only (Ivan 2026-11-22): the footer's pages plus About and Plan, from md (768px) up: measured 667px of pill content, so
// between sm and md they would scroll inside the pill. The phone bar stays Events | Log in.
const WEB_ITEMS = [
  { key: 'how', label: 'How it works', href: '/#how-it-works' },
  { key: 'platform', label: 'Platform', href: '/#platform' },
  { key: 'about', label: 'About', href: '/about' },
  { key: 'plan', label: 'Plan', href: '/pricing' },
] as const;

export type SiteNavProps = {
  active?: SiteNavActive;
  /** Visitor is signed in: shows the Account menu (or Programme pill for staff) instead of the Log in pill. */
  signedIn?: boolean;
  /** Signed-in staff session: StaffProgrammePill instead of AccountMenu. */
  isStaff?: boolean;
  accountComplete?: boolean;
  unlinkedCount?: number;
  /** Where the signed-out "Log in" pill goes (the landing sets the organiser door while its toggle is on Organiser). */
  loginHref?: string;
  /** Visible label of the signed-out pill; default "Log in". The landing sets "Organiser log in" while its toggle is on Organiser. */
  loginLabel?: string;
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
  loginLabel = 'Log in',
  authSlot,
  beforeAuth,
  className = 'mx-[1.125rem]',
}: SiteNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  useScrollFade(navRef);

  const brandHref = signedIn && !isStaff ? '/events' : '/';

  return (
    <>
      {/* Phone (Ivan 2026-11-21): logo stays on top with no bar; the nav is the fixed bottom pill below.
          The in-pill brand is hidden below sm, so the link exists once for assistive tech. */}
      <div className="mx-[1.125rem] pt-sm sm:hidden">
        <BrandMark href={brandHref} />
      </div>
    <nav
      aria-label="Primary"
      className={`glass-nav z-[5] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm max-sm:gap-0 max-sm:pl-sm max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[calc(0.625rem+env(safe-area-inset-bottom))] max-sm:justify-evenly sm:sticky sm:top-[0.625rem] ${className}`}
    >
      <div className="hidden shrink-0 sm:block">
        <BrandMark href={brandHref} hideWordmarkOnPhone />
      </div>

      {/* min-w-0 + overflow-x-auto: brand and CTA never shrink; this group scrolls if it must.
          "Upcoming events" -> "Events" below sm: the overflow fallback has no visible affordance on mobile. */}
      <div ref={navRef} className={`scroll-fade -my-[0.3125rem] flex min-w-0 items-center gap-[0.125rem] overflow-x-auto overflow-y-hidden py-[0.3125rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:flex-1 max-sm:justify-evenly max-sm:gap-0`}>
        {active === 'events' ? (
          <span aria-current="page" className={`${NAV_ITEM} ${NAV_ACTIVE} ${HALF}`}>
            <span className="sm:hidden"><span className="reserve-bold" data-text="Events">Events</span></span>
            <span className="hidden sm:inline"><span className="reserve-bold" data-text="Upcoming events">Upcoming events</span></span>
          </span>
        ) : (
          <Link href="/events" className={`${NAV_ITEM} ${NAV_IDLE} ${HALF}`}>
            <span className="sm:hidden"><span className="reserve-bold" data-text="Events">Events</span></span>
            <span className="hidden sm:inline"><span className="reserve-bold" data-text="Upcoming events">Upcoming events</span></span>
          </Link>
        )}
        {WEB_ITEMS.map((item) =>
          active === item.key ? (
            <span key={item.key} aria-current="page" className={`${NAV_ITEM} ${NAV_ACTIVE} max-md:hidden`}>
              <span className="reserve-bold" data-text={item.label}>{item.label}</span>
            </span>
          ) : (
            <Link key={item.key} href={item.href} className={`${NAV_ITEM} ${NAV_IDLE} max-md:hidden`}>
              <span className="reserve-bold" data-text={item.label}>{item.label}</span>
            </Link>
          ),
        )}
      </div>

      <div className="flex shrink-0 items-center gap-sm max-sm:flex-1 max-sm:justify-end">
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
              {loginLabel}
            </Link>
          ))}
      </div>
    </nav>
    </>
  );
}
