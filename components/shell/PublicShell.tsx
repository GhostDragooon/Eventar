import Link from 'next/link';

/**
 * Public-facing shell for anon-accessible routes: /events/[id] (register),
 * /checkin/confirm, /survey, /login. Top bar carries the centered Eventar
 * wordmark (matches StaffShell's revised §8 — brand centered on every page).
 * Footer is the single-line "By Eventar" credit (§2).
 *
 * Public pages have no parent + no auth — the left/right NAV slots stay
 * empty, but the bar uses the same `grid-cols-[1fr_auto_1fr]` layout as
 * StaffShell so the wordmark lands at the same horizontal position.
 *
 * Patterns: docs/plans/eventar-design-patterns.md §2 (uniform footer),
 * §3/§5 (rhythm), §8 revised (brand centered on every page).
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <nav
        aria-label="Primary"
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-md border-b border-outline-variant px-grid-margin py-md text-[13px]"
      >
        <div />
        <Link
          href="/"
          className="justify-self-center font-bold text-[15px] text-on-surface hover:opacity-90 transition-opacity tracking-tight"
        >
          Eventar
        </Link>
        <div />
      </nav>

      <main className="flex-1 w-full">{children}</main>

      <footer className="w-full py-lg text-center">
        <span className="font-sans text-[12px] font-medium tracking-wide text-on-surface-variant">
          By Eventar
        </span>
      </footer>
    </div>
  );
}
