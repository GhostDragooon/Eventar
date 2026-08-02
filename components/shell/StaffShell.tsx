'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Staff shell — M2 Stage 2 (2026-08-01), replacing the three-column top NAV
// with the locked global-shell architecture: a persistent top bar + a
// persistent left sidebar, where THE SIDEBAR IS THE NAVIGATION and only the
// content region changes between pages.
//
// Deliberately NOT built (each would fabricate a capability the backend does
// not have, and a shell that lies is worse than a plain one):
//   · workspace switcher  — staff belong to exactly one organisation today;
//                           a switcher implies multi-org membership
//   · venue status pill    — there is no venue-link subsystem to report on
//   · notification bell    — there is no needs-attention queue to open
//   · ⌘K global search     — there is no search backend (tagged post-M4)
// They belong to the surfaces that make them real, not to this stage.
//
// NO Eventar wordmark in the shell chrome (locked naming rule, carried over
// from the previous nav) — brand presence lives in the "By Eventar" footer.
// The artifact's mockup shows a brand mark top-left; that is a design target,
// not a rule source, so the locked rule wins until Ivan says otherwise.
//
// Nav lists ONLY routes that exist. The artifact's sidebar also shows
// Participants / Accreditation / Communications / Reports; wiring those now
// would ship links to 404s. They arrive with their surfaces (Stage 4+).

type StaffShellBaseProps = {
  staff: { email: string; role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff' };
  children: React.ReactNode;
};

type StaffShellBackProps =
  | { backHref: string; backLabel: string }
  | { backHref?: never; backLabel?: never };

export type StaffShellProps = StaffShellBaseProps & StaffShellBackProps;

// Only staff routes that render INSIDE this shell.
//
// "Events" used to sit here pointing at /events — which is app/(public)/events,
// a SiteShell page. Clicking it in the staff sidebar loaded the public listing
// and the whole sidebar vanished, which reads as the app breaking. /dashboard
// is already the staff events list (filter tabs by lifecycle, search, sort,
// per-event edit/delete), so the link was both broken and redundant. A
// dedicated staff /events route can earn its place back when it exists.
const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Check-in', href: '/checkin', icon: 'how_to_reg' },
  { label: 'Analytics', href: '/analytics', icon: 'bar_chart' },
];

function isActive(pathname: string, href: string): boolean {
  // The '/events' branch that used to live here is gone with the nav item —
  // nothing routes there from this shell any more, so it was dead code.
  if (href === '/checkin') return pathname === '/checkin' || pathname.endsWith('/checkin');
  if (href === '/analytics') return pathname === '/analytics' || pathname.endsWith('/analytics');
  return pathname === href;
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // whitespace-nowrap: on the mobile horizontal strip the flex children
      // shrink, and "Check-in" wrapped to two lines mid-word. The strip
      // scrolls, so refusing to wrap is the correct trade.
      className={`flex shrink-0 items-center gap-sm whitespace-nowrap rounded-lg px-sm py-sm text-[13px] font-medium transition-colors ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}

export function StaffShell(props: StaffShellProps) {
  const { staff, children, backHref, backLabel } = props;
  const pathname = usePathname() ?? '';

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-on-surface">
      {/* Skip link (WCAG 2.4.1 Bypass Blocks). The sidebar puts five nav links
          ahead of the page content on every staff route, so a keyboard or
          screen-reader user otherwise tabs the whole nav on every navigation.
          Visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded-lg focus:bg-primary focus:px-md focus:py-sm focus:text-[13px] focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>

      {/* Top bar — persistent. Left carries page context (the back link the
          9 consuming pages already pass), right carries the account. */}
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-md border-b border-outline-variant px-grid-margin">
        <div className="flex min-w-0 items-center">
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="truncate text-[13px] text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <span aria-hidden>← </span>
              Back to {backLabel}
            </Link>
          )}
        </div>

        {/* Right: identity only. Settings moved INTO the sidebar — with the
            sidebar owning navigation, a second link to the same destination up
            here was a duplicate nav entry (and made the accessible name
            "Settings" ambiguous for anything querying by role+name). */}
        <div className="flex shrink-0 items-center gap-sm text-[13px]">
          <span className="hidden max-w-[220px] truncate text-on-surface-variant sm:inline" title={staff.email}>
            {staff.email}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar — the navigation. Below md it becomes a horizontal
            scrollable strip so the same links stay reachable on a phone
            without a second nav implementation to keep in sync. */}
        {/* Sticky + viewport-height on desktop. Without this the aside grows to
            the full page height, so "pin Settings to the bottom" put it ~1450px
            down — off-screen and unreachable without scrolling the whole page.
            Sticking the sidebar keeps every nav item in view at any scroll
            position, which is the point of a persistent sidebar. */}
        <aside className="shrink-0 border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:h-[calc(100vh-60px)] md:w-[248px] md:self-start md:border-b-0 md:border-r">
          {/* aria-label belongs on the <nav>, not the <aside>. An <aside> is a
              COMPLEMENTARY landmark; labelling it "Primary" named the wrong
              landmark and left the real navigation landmark anonymous. */}
          <nav
            aria-label="Primary"
            className="flex gap-xs overflow-x-auto p-sm md:h-full md:flex-col md:gap-xs md:overflow-y-auto md:p-md"
          >
            {NAV.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
            ))}
            {/* Settings is pinned to the foot of the sidebar on desktop (it is
                a destination, not a section). Without it here the sidebar shows
                NO active item while you are on /settings, which reads as a
                broken nav — the gear in the top bar was the only entry point. */}
            <div className="hidden md:block md:flex-1" aria-hidden />
            <NavLink href="/settings" label="Settings" icon="settings" active={pathname === '/settings'} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Page canvas — only this region changes between pages. */}
          <main
            id="main-content"
            tabIndex={-1}
            /* mx-auto: dropped in the Stage 2 rewrite, which left content pinned
               left of a 1440px column on wide screens instead of centred in the
               space beside the sidebar. */
            className="w-full max-w-[1440px] flex-1 mx-auto p-grid-margin pb-xxl"
          >
            {children}
          </main>

          {/* Brand footer band — the only place the wordmark lives. */}
          <footer className="w-full border-t border-outline-variant bg-surface-container-lowest py-md text-center">
            <span className="text-[11px] text-on-surface-variant">
              By <span className="font-bold text-on-surface">Eventar</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
