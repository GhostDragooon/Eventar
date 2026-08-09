'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';

// Organiser shell — rebuilt 2026-08-09 to `docs/plans/2026-07-12-organiser-ia-spec.md`.
//
// That spec's layout decision is explicit and was NOT optional:
//   "Left sidebar for the organiser web app (witan/Cadre pattern - both
//    references use it; 8 nav areas outgrow the shipped 3-part top bar), plus
//    a slim top context bar (org name, global search, user menu)."
//
// On 2026-08-08 I replaced that sidebar with a single top pill nav. That was a
// mistake with a specific cause worth recording so it does not recur: the
// option Ivan chose was about applying ONE DESIGN LANGUAGE across surfaces, and
// I wrote "replaces the sidebar architecture" into that option's description.
// A paint decision was allowed to carry an architecture decision. The IA spec
// was never read; this file's own comment already said the sidebar was locked.
//
// The design language still applies - it is applied TO the sidebar (glass
// material, pill active states, the blue ramp, one type scale) rather than by
// deleting it.
//
// Palette note: the 2026-07-12 mockups are teal. Teal was retired 2026-07-16 in
// favour of the blue ramp, which is the newer locked decision, so the STRUCTURE
// comes from the mockups and the COLOUR from the current tokens.
//
// Wordmark: the mockup puts "Eventar" at the top of the sidebar. That reverses
// the older "no wordmark in shell chrome" rule - Ivan's call 2026-08-09, taken
// explicitly after being shown the conflict.

type StaffShellBaseProps = {
  staff: { email: string; role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff' };
  children: React.ReactNode;
};

type StaffShellBackProps =
  | { backHref: string; backLabel: string }
  | { backHref?: never; backLabel?: never };

export type StaffShellProps = StaffShellBaseProps & StaffShellBackProps;

/**
 * 7 of the spec's 8 areas (6 here + Settings, rendered separately below).
 * `href: null` means the surface does not exist yet: rendered visible-but-inert
 * so the shell shows the real IA without shipping a link to a 404 (Ivan's call
 * 2026-08-09). Give an item an href the day its route lands - that is the whole
 * migration.
 *
 * EVENTS IS DELIBERATELY ABSENT (Ivan's call 2026-08-09). It was previously
 * rendered inert with a SOON chip, which told an organiser a capability was
 * coming while they were already standing in it: /dashboard IS the staff events
 * list (lifecycle filter tabs, search, sort, per-event edit/delete). The real
 * defect underneath was an audience boundary, not a routing one - the original
 * link pointed at app/(public)/events, the ATTENDEE-facing directory, so
 * clicking it from the staff sidebar loaded the public listing and the sidebar
 * vanished. The attendee list is not a staff nav destination at all. If the
 * spec's dedicated organiser list is ever built, it gets its own route and its
 * own row then - not a placeholder now.
 */
const NAV: { label: string; href: string | null; icon: string; count?: number }[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Participants', href: null, icon: 'group' },
  { label: 'Accreditation', href: null, icon: 'verified_user' },
  { label: 'Check-in', href: '/checkin', icon: 'how_to_reg' },
  { label: 'Communications', href: null, icon: 'mail' },
  { label: 'Reports', href: '/analytics', icon: 'bar_chart' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/checkin') return pathname === '/checkin' || pathname.endsWith('/checkin');
  if (href === '/analytics') return pathname === '/analytics' || pathname.endsWith('/analytics');
  return pathname === href;
}

function NavRow({
  label,
  href,
  icon,
  count,
  active,
}: {
  label: string;
  href: string | null;
  icon: string;
  count?: number;
  active: boolean;
}) {
  const inner = (
    <>
      <span className="material-symbols-outlined text-[calc(20px*var(--text-scale))]" aria-hidden>
        {icon}
      </span>
      {/* No `truncate`: at 248px every label fits, and truncating clipped
          "Communications" to "Communicati…" once the Soon chip took its space. */}
      <span className="flex-1 whitespace-nowrap text-left">{label}</span>
      {count !== undefined && (
        <span className="rounded-full bg-surface-container-high px-sm py-[1px] text-[calc(11px*var(--text-scale))] font-semibold text-on-surface-variant">
          {count}
        </span>
      )}
    </>
  );

  const base =
    'nav-item flex w-full items-center gap-sm rounded-full px-md py-sm text-[calc(13.5px*var(--text-scale))] font-medium';

  if (!href) {
    return (
      <span
        // Not a <button>: it is not actionable, and a disabled button is still
        // a tab stop in some AT. `aria-disabled` + the visible "Soon" chip say
        // the same thing to sighted and non-sighted users.
        aria-disabled="true"
        title={`${label} — surface not built yet`}
        className={`${base} cursor-default text-on-surface-variant/45`}
      >
        {inner}
        <span className="rounded-full border border-outline-variant px-sm py-[1px] text-[calc(10px*var(--text-scale))] font-semibold uppercase tracking-[.06em] text-on-surface-variant/70">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${
        active
          ? 'bg-primary-container font-semibold text-on-primary-container'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {inner}
    </Link>
  );
}

export function StaffShell(props: StaffShellProps) {
  const { staff, children, backHref, backLabel } = props;
  const pathname = usePathname() ?? '';

  return (
    <div className="app-atmo flex min-h-screen w-full flex-col text-on-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded-full focus:bg-primary focus:px-md focus:py-sm focus:text-[calc(13px*var(--text-scale))] focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* SIDEBAR — the navigation, per the IA spec. Sticky and viewport-tall
            on desktop so Settings at the foot stays reachable at any scroll
            position; a horizontal strip below md, which is what the pre-2026-08-08
            shell did too (the spec's real mobile answer is a bottom nav with
            Scan as the centre action — that is its own piece of work). */}
        <aside className="shrink-0 border-b border-outline-variant md:sticky md:top-0 md:h-screen md:w-[248px] md:self-start md:border-b-0 md:border-r">
          <div className="flex h-full flex-col gap-md p-md">
            {/* Brand mark. Reinstated 2026-08-09 per the mockup. */}
            {/* href="/" is the shipped behaviour, kept deliberately: changing it
                was not part of the wordmark decision. Worth a look though — from
                a staff surface the mark lands on the marketing landing, which
                ejects the organiser out of the app. Same class as the old Events
                link that loaded the public listing. Flagged, not changed. */}
            <BrandMark compact />

            <nav
              aria-label="Primary"
              className="flex gap-xs overflow-x-auto md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto"
            >
              {NAV.map((item) => (
                <NavRow
                  key={item.label}
                  {...item}
                  active={item.href ? isActive(pathname, item.href) : false}
                />
              ))}

              {/* ADMIN group, per the mockup. */}
              <p className="mt-md hidden px-md text-[calc(10px*var(--text-scale))] font-semibold uppercase tracking-[.1em] text-on-surface-variant/70 md:block">
                Admin
              </p>
              <NavRow label="Settings" href="/settings" icon="settings" active={pathname === '/settings'} />
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* SLIM TOP CONTEXT BAR — org name, global search, user menu. */}
          <header className="glass-nav sticky top-0 z-[5] flex items-center gap-md border-b border-outline-variant px-grid-margin py-sm">
            <div className="min-w-0 shrink-0">
              {backHref && backLabel ? (
                <Link
                  href={backHref}
                  className="nav-item block max-w-[220px] truncate text-[calc(13px*var(--text-scale))] text-on-surface-variant hover:text-on-surface"
                >
                  <span aria-hidden>← </span>
                  Back to {backLabel}
                </Link>
              ) : (
                // The mockup shows the organisation name here. StaffShell is
                // only handed `staff`, so printing the mockup's "Demo CPD
                // Alliance" would hardcode a fixture name into every real
                // tenant's chrome — the same fabrication this shell's own
                // comments reject elsewhere. The label is honest until the org
                // is actually threaded through.
                <p className="truncate text-[calc(12px*var(--text-scale))] font-semibold uppercase tracking-[.08em] text-on-surface-variant">
                  Organiser workspace
                </p>
              )}
            </div>

            {/* Search is in the spec's context bar, but there is no search
                backend (the spec tags global search post-M4 and the previous
                shell removed it for exactly that reason). Rendering a live-
                looking input that returns nothing is the "chrome that lies"
                failure. Shown disabled, labelled, so the slot is visibly
                reserved without pretending to work. */}
            <div className="hidden flex-1 justify-center lg:flex">
              <div
                aria-hidden
                className="flex w-full max-w-[420px] items-center gap-sm rounded-full border border-outline-variant bg-surface-container-lowest/70 px-md py-[6px] text-[calc(12.5px*var(--text-scale))] text-on-surface-variant/60"
              >
                <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]">search</span>
                Search — coming with the search backend
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-sm">
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-full bg-primary-container text-[calc(11px*var(--text-scale))] font-semibold text-on-primary-container"
                aria-hidden
              >
                {staff.email.slice(0, 2).toUpperCase()}
              </span>
              <span
                className="hidden max-w-[220px] truncate text-[calc(12.5px*var(--text-scale))] text-on-surface-variant sm:inline"
                title={staff.email}
              >
                {staff.email}
              </span>
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="w-full max-w-[1440px] flex-1 p-grid-margin pb-xxl"
          >
            {children}
          </main>

          <SiteFooter links={false} />
        </div>
      </div>
    </div>
  );
}
