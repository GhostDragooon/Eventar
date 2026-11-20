import { SiteFooter } from './SiteFooter';
import { SiteNav, type SiteNavActive } from './SiteNav';

// Public website chrome (events list, log-in doors, 404). The nav is the shared
// SiteNav; this adds the page ground and footer.

export function SiteShell({
  children,
  active,
  footer = 'brand',
  signedIn = false,
  isStaff = false,
  accountComplete = false,
  unlinkedCount = 0,
  loginHref,
}: {
  children: React.ReactNode;
  // The nav item that points at this page; it renders as a non-link
  // (aria-current="page"). Optional: a page that belongs to none of the items passes nothing.
  active?: SiteNavActive;
  footer?: 'brand' | 'none';
  /**
   * Whether the visitor is signed in. Drives the right-side CTA — signed-in
   * shows the Account disclosure menu (or Programme pill when isStaff),
   * signed-out shows "Sign in" → /account/sign-in. Kept as a plain prop
   * rather than an in-component `auth.getUser()` read because SiteShell is
   * used from client components (`/login`, `/account/sign-in`) that can't
   * import async server code; server-side callers compute it and pass it.
   * Defaults to false — the honest default when a caller can't know.
   */
  signedIn?: boolean;
  /**
   * Whether the signed-in caller is an organiser (staff session). Ivan
   * 2026-09-24: organisers have no attendee identity, so the AccountMenu's
   * My record / Profile / Claim items don't apply to them — show the
   * StaffProgrammePill (route back to /dashboard) instead. Ignored when
   * signedIn is false. Defaults to false — an attendee session is the
   * honest default when a caller can't know.
   */
  isStaff?: boolean;
  /**
   * Whether the signed-in caller's account is complete — picks the Account
   * menu's item set (2026-09-21 instruction §4.2 / Ivan's AskUserQuestion
   * call). Ignored when signedIn is false or isStaff is true.
   */
  accountComplete?: boolean;
  /** Shows "Claim past events" in the menu only when > 0. */
  unlinkedCount?: number;
  /**
   * Where the signed-out "Log in" pill goes. Default is the attendee door; the invite page passes the organiser door with
   * its own `?next=` so the pill cannot drop the invite. When set, the header's separate "Organiser log in" link is not
   * shown (the pill already is that door).
   */
  loginHref?: string;
}) {
  return (
    <div className="app-atmo flex min-h-dvh flex-col text-on-surface">
      <SiteNav
        active={active}
        signedIn={signedIn}
        isStaff={isStaff}
        accountComplete={accountComplete}
        unlinkedCount={unlinkedCount}
        loginHref={loginHref}
      />

      <main className="w-full flex-1">{children}</main>

      {footer === 'brand' && <SiteFooter onEvents={active === 'events'} />}
    </div>
  );
}
