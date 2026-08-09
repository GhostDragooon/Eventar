import Link from 'next/link';
import { BrandMark } from '@/components/shell/BrandMark';

const NAV_ITEM =
  'nav-item rounded-full px-[11px] py-[7px] text-[calc(13px*var(--text-scale))] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';

/**
 * The artifact's glass pill nav — floats over the hero's gradient rather than
 * sitting in a bordered bar. Deliberately NOT `SiteShell`'s nav: that one is
 * the app's three-column chrome (Home / Upcoming events / Sign in) and belongs
 * on `/events`, where the visitor is already inside the product. The landing is
 * a marketing surface and gets marketing navigation.
 *
 * Sticky at top:10px so it detaches from the page edge as you scroll — the
 * "pill floating on the page" read only works if it never touches the top.
 *
 * Sits at PAGE level (a child of the `.hero-ground` root in app/page.tsx), not
 * inside `.hero-zone`. Both constraints have to hold at once: the gradient must
 * start at y=0 or a white band appears above the pill, and the nav's containing
 * block must be the full document or `position: sticky` releases at the hero's
 * bottom edge and the landing loses its nav for the remaining ~1400px. Moving
 * the glow to `.hero-ground` satisfies both.
 */
export function LandingNav() {
  return (
    <nav
      aria-label="Primary"
      className="glass-nav sticky top-[10px] z-[5] mx-[18px] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm"
    >
      <BrandMark />

      {/* Every item lands on something that exists. All four previously
          pointed at /events, so the nav offered four labels and one
          destination — the "nothing goes where it says" bug.

          Three are in-page anchors because the section they name IS on this
          page; only "Upcoming events" leaves for a route. Anchors are plain
          <a>: next/link's client router has nothing to prefetch for a hash on
          the current document. */}
      <div className="hidden items-center gap-[2px] md:flex">
        {[
          { label: 'How it works', href: '#how-it-works' },
          { label: 'Platform', href: '#platform' },
          { label: 'For organisers', href: '#for-organisers' },
          { label: 'Upcoming events', href: '/events', route: true },
        ].map((l) =>
          l.route ? (
            <Link key={l.label} href={l.href} className={NAV_ITEM}>
              {l.label}
            </Link>
          ) : (
            <a key={l.label} href={l.href} className={NAV_ITEM}>
              {l.label}
            </a>
          ),
        )}
      </div>

      {/* "Log in", not "Staff sign in" — Ivan 2026-08-08. One label for one
          destination; /login is the only sign-in surface there is. */}
      <Link
        href="/login"
        className="rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        Log in
      </Link>
    </nav>
  );
}
