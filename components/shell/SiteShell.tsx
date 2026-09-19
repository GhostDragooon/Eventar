import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';

// Public website chrome (events list, login, 404).
//
// 2026-08-08 (Ivan): one design language across every surface. This was a
// bordered, edge-to-edge three-column bar, which is why walking from the
// landing to /events felt like leaving the product. It now uses the same
// floating glass pill as `LandingNav` — same material (`.glass-nav`), same
// geometry (sticky top-[10px], mx-[18px], rounded-full), same pill actions,
// same 13px nav type — over the quiet `.app-atmo` ground.
//
// WORDMARK: present, as of 2026-08-09 (Ivan). The old "no wordmark in shell
// chrome" rule is retired on every shell, not just the organiser sidebar — an
// attendee crossing from a public event page into staff used to watch the brand
// appear from nowhere. The pill is therefore three-column now (mark, sections,
// action), matching `LandingNav`, where it was two-column precisely because
// there was no mark to anchor the left.
//
// 2026-09-04 (Ivan Q on nav-shape): right-side CTA is state-aware — signed-out
// gets "Sign in" pointing at /account/sign-in (attendee door), signed-in gets
// "Account" pointing at /account. Staff /login stays reachable via direct URL
// (organisers know the address; unrouted door for the outbound audience).
// Q32's audience-boundary rule holds: the pill picks the right door rather
// than surfacing two.

// whitespace-nowrap: at narrow (375px) widths the three flex children (brand,
// nav links, CTA pill) don't all fit on one line unwrapped, so flexbox was
// shrinking each Link below its content width instead — wrapping "Upcoming
// events" and "Sign in" awkwardly mid-phrase rather than overflowing.
// nowrap + shrink-0 keeps each label intact; nav's own overflow-x-auto
// (below) is the safety net if labels still don't all fit (user-lens
// 2026-09-19).
const NAV_ITEM =
  'nav-item shrink-0 whitespace-nowrap rounded-full px-[11px] py-[7px] text-[calc(13px*var(--text-scale))] font-medium';
const NAV_IDLE = 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';
const NAV_ACTIVE = 'bg-surface-container-high font-semibold text-on-surface';

export function SiteShell({
  children,
  active,
  footer = 'brand',
  signedIn = false,
}: {
  children: React.ReactNode;
  // 'account' now renders as an active-tinted "Account" pill; 'signin'
  // active-tints the signed-out "Sign in" pill. Neither means "none of
  // the visible tabs" any more — that meaning is dead, but the union kept
  // for callers that still pass a value.
  active: 'home' | 'events' | 'signin' | 'account';
  footer?: 'brand' | 'none';
  /**
   * Whether the visitor is signed in. Drives the right-side CTA — signed-in
   * shows "Account" → /account, signed-out shows "Sign in" → /account/sign-in.
   * Kept as a plain prop rather than an in-component `auth.getUser()` read
   * because SiteShell is used from client components (`/login`,
   * `/account/sign-in`) that can't import async server code; server-side
   * callers compute it and pass it. Defaults to false — the honest default
   * when a caller can't know (a client component with no client-side auth
   * read of its own).
   */
  signedIn?: boolean;
}) {
  return (
    <div className="app-atmo flex min-h-screen flex-col text-on-surface">
      <nav
        aria-label="Primary"
        className="glass-nav sticky top-[10px] z-[5] mx-[18px] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm"
      >
        <div className="shrink-0">
          <BrandMark />
        </div>

        {/* min-w-0 + overflow-x-auto: the safety net for narrow viewports.
            Brand and the CTA pill (shrink-0 on both) always stay fully
            visible; this is the one flex child allowed to scroll
            horizontally if "Home" + "Upcoming events" still don't both fit
            at their full (now nowrap) width (user-lens 2026-09-19). */}
        <div className="flex min-w-0 items-center gap-[2px] overflow-x-auto">
          <Link
            href="/"
            aria-current={active === 'home' ? 'page' : undefined}
            className={`${NAV_ITEM} ${active === 'home' ? NAV_ACTIVE : NAV_IDLE}`}
          >
            Home
          </Link>
          <Link
            href="/events"
            aria-current={active === 'events' ? 'page' : undefined}
            className={`${NAV_ITEM} ${active === 'events' ? NAV_ACTIVE : NAV_IDLE}`}
          >
            Upcoming events
          </Link>
        </div>

        {signedIn ? (
          <Link
            href="/account"
            aria-current={active === 'account' ? 'page' : undefined}
            className="shrink-0 whitespace-nowrap rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Account
          </Link>
        ) : (
          <Link
            href="/account/sign-in"
            aria-current={active === 'signin' ? 'page' : undefined}
            className="shrink-0 whitespace-nowrap rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Sign in
          </Link>
        )}
      </nav>

      <main className="w-full flex-1">{children}</main>

      {footer === 'brand' && <SiteFooter />}
    </div>
  );
}
