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
 *
 * Outer wrapper carries `max-w-[1200px] mx-auto px-[15px]` (2026-08-21) —
 * same box every content section below uses — so the pill's own left/right
 * edge lines up with the hero/WhyEventar/etc. panels beneath it instead of
 * floating wider (the old `mx-[18px]` measured from the viewport edge, not
 * from the shared content column). `sticky`/`z-index` moved to this wrapper;
 * the `<nav>` itself is just the pill, full width of the wrapper.
 *
 * `w-full` is load-bearing (2026-08-21): this div is a direct child of
 * `.hero-ground`'s column flexbox, and a flex item's `mx-auto` overrides
 * the default cross-axis stretch — without an explicit width, the div
 * shrinks to its content (~793px) and centers *that*, instead of stretching
 * to the container width first so `max-w-[1200px]` has 1200px to clamp.
 * Every sibling box below (Hero, WhyEventar, ...) sits inside `<main>`, a
 * plain block context with no flex parent, so it never hit this.
 */
export function LandingNav() {
  return (
    <div className="sticky top-[10px] z-[5] mx-auto w-full max-w-[1200px] px-[15px]">
      <nav
        aria-label="Primary"
        className="glass-nav flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm"
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

      <div className="flex items-center gap-xs">
        {/* Added 2026-08-20: was Log-in-only, so a visitor with an event to
            run had no path other than clicking Log in and hoping. Points at
            /events/new directly — requireStaff() there already redirects an
            anonymous visitor to /login, so this doesn't bypass auth, it just
            names the actual destination instead of making them guess it's
            behind "Log in". Outline, not filled: Log in stays the one
            emphasised action, unchanged from Ivan's 2026-08-08 call. */}
        <Link
          href="/events/new"
          className="rounded-full border border-outline px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-surface transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Start an Event
        </Link>

        {/* "Log in", not "Staff sign in" — Ivan 2026-08-08. One label for one
            destination; /login is the only sign-in surface there is. */}
        <Link
          href="/login"
          className="rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Log in
        </Link>
      </div>
      </nav>
    </div>
  );
}
