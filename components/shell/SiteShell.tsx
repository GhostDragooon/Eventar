import Link from 'next/link';

// Public website chrome (Landing + Events list): same three-column nav grid
// as the app shells — center section links, right `Sign in`. No wordmark in
// the nav (locked); brand lives in the footer. Landing supplies its own
// 4-column dark footer via footer="none".
export function SiteShell({
  children,
  active,
  footer = 'brand',
}: {
  children: React.ReactNode;
  active: 'home' | 'events' | 'signin';
  footer?: 'brand' | 'none';
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <nav
        aria-label="Primary"
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-md border-b border-outline-variant px-grid-margin py-md text-[13px]"
      >
        <div />
        <div className="flex items-center gap-lg justify-self-center">
          <Link
            href="/"
            aria-current={active === 'home' ? 'page' : undefined}
            className={`font-medium transition-colors ${active === 'home' ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Home
          </Link>
          <Link
            href="/events"
            aria-current={active === 'events' ? 'page' : undefined}
            className={`font-medium transition-colors ${active === 'events' ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Upcoming events
          </Link>
        </div>
        <div className="flex items-center justify-self-end">
          <Link
            href="/login"
            aria-current={active === 'signin' ? 'page' : undefined}
            className={`transition-colors ${active === 'signin' ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Sign in
          </Link>
        </div>
      </nav>

      <main className="flex-1 w-full">{children}</main>

      {footer === 'brand' && (
        <footer className="w-full border-t border-outline-variant bg-surface-container-lowest py-md text-center">
          <span className="text-[11px] text-on-surface-variant">
            By <span className="font-bold text-on-surface">Eventar</span>
          </span>
        </footer>
      )}
    </div>
  );
}
