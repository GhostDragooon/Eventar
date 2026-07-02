'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Staff nav — Design Session Log §"Layout patterns → Nav (every staff page)".
// Three-column CSS grid `1fr auto 1fr`:
//   LEFT   back-context link (`← Back to {parent}`), empty on root pages
//   CENTER section tabs `Dashboard · Events · Check-in · Analytics`
//          (sentence case, active = dark, others muted, NO underline)
//   RIGHT  account email + settings icon
//
// NO Eventar wordmark in the nav (locked naming rule) — brand presence lives
// in the "By Eventar" footer band. Sign-out moved to /settings.

type StaffShellBaseProps = {
  staff: { email: string; role: 'organizer' | 'manager' };
  children: React.ReactNode;
};

type StaffShellBackProps =
  | { backHref: string; backLabel: string }
  | { backHref?: never; backLabel?: never };

export type StaffShellProps = StaffShellBaseProps & StaffShellBackProps;

const TABS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Events', href: '/events' },
  { label: 'Check-in', href: '/checkin' },
  { label: 'Analytics', href: '/analytics' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/events') {
    // The Events tab owns the public list only — /events/[id]/* staff pages
    // belong to their entry tab context, not here.
    return pathname === '/events';
  }
  if (href === '/checkin') return pathname === '/checkin' || pathname.endsWith('/checkin');
  if (href === '/analytics') return pathname === '/analytics' || pathname.endsWith('/analytics');
  return pathname === href;
}

export function StaffShell(props: StaffShellProps) {
  const { staff, children, backHref, backLabel } = props;
  const pathname = usePathname() ?? '';

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-on-surface">
      <nav
        aria-label="Primary"
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-md border-b border-outline-variant px-grid-margin py-md text-[13px]"
      >
        {/* Left slot: back link (empty on root pages). */}
        <div className="flex items-center justify-self-start">
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span aria-hidden>← </span>
              Back to {backLabel}
            </Link>
          )}
        </div>

        {/* Center slot: section tabs. Active = dark, no underline indicator. */}
        <div className="flex items-center gap-lg justify-self-center">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`font-medium transition-colors ${
                  active ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Right slot: email + settings icon. */}
        <div className="flex items-center gap-sm justify-self-end">
          <span className="text-on-surface-variant" title={staff.email}>
            {staff.email}
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex items-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              settings
            </span>
          </Link>
        </div>
      </nav>

      {/* Page canvas */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-grid-margin pb-xxl">
        {children}
      </main>

      {/* Brand footer band — the only place the wordmark lives. */}
      <footer className="w-full border-t border-outline-variant bg-surface-container-lowest py-md text-center">
        <span className="text-[11px] text-on-surface-variant">
          By <span className="font-bold text-on-surface">Eventar</span>
        </span>
      </footer>
    </div>
  );
}
