'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SignOutButton } from './SignOutButton';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
  disabledReason?: string;
};

// Match the six-item nav from the Staff Dashboard / Attendee List / New Event
// mockups. Items the app doesn't have yet (Attendees, Sessions, Analytics,
// Settings) stay visible — they're load-bearing in the mockup's visual
// rhythm — but render as disabled with a "Coming in Phase 5+" tooltip.
// Active-state mapping documented in `isActive` below.
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '#attendees', label: 'Attendees', icon: 'groups', disabled: true, disabledReason: 'Per-event attendee view ships with Phase 5+' },
  { href: '#sessions', label: 'Sessions', icon: 'calendar_today', disabled: true, disabledReason: 'Multi-session events are not yet supported' },
  { href: '#analytics', label: 'Analytics', icon: 'insights', disabled: true, disabledReason: 'Analytics dashboard ships in Phase 6' },
  { href: '/events/new', label: 'Registration', icon: 'how_to_reg' },
  { href: '#settings', label: 'Settings', icon: 'settings', disabled: true, disabledReason: 'Org settings ship post-Phase-6' },
];

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith('#')) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  // /events/new and /events/[id]/* both route through the "Registration" tab.
  if (href === '/events/new') return pathname.startsWith('/events');
  return pathname === href;
}

export function StaffShell({
  staff,
  children,
}: {
  staff: { email: string; role: 'organizer' | 'manager' };
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const initials = staff.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-background text-on-surface">
      {/* Desktop sidenav (fixed, ≥md) */}
      <nav
        aria-label="Primary"
        className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface-container-low border-r border-outline-variant p-md gap-sm z-40"
      >
        <SidenavBody staff={staff} initials={initials} pathname={pathname} />
      </nav>

      {/* Mobile top bar (< md) */}
      <header className="md:hidden fixed top-0 inset-x-0 bg-surface-container-low border-b border-outline-variant flex items-center justify-between px-grid-margin py-md z-40">
        <Link href="/dashboard" className="text-headline-sm font-headline-sm text-primary">
          Eventar
        </Link>
        <button
          type="button"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((v) => !v)}
          className="p-xs rounded-lg hover:bg-surface-container-high transition-colors text-on-surface"
        >
          <span className="material-symbols-outlined" aria-hidden>
            {mobileNavOpen ? 'close' : 'menu'}
          </span>
        </button>
      </header>

      {/* Mobile slide-down nav */}
      {mobileNavOpen && (
        <nav
          aria-label="Primary mobile"
          className="md:hidden fixed top-[64px] inset-x-0 bg-surface-container-low border-b border-outline-variant px-md py-md flex flex-col gap-sm z-30 max-h-[calc(100vh-64px)] overflow-y-auto"
          onClick={() => setMobileNavOpen(false)}
        >
          <SidenavBody staff={staff} initials={initials} pathname={pathname} compact />
        </nav>
      )}

      {/* Main canvas */}
      <main className="flex-1 md:ml-64 pt-[64px] md:pt-0 min-h-screen flex flex-col">
        <div className="flex-1 p-grid-margin w-full max-w-[1440px] mx-auto pb-xxl">{children}</div>
        <Footer />
      </main>
    </div>
  );
}

function SidenavBody({
  staff,
  initials,
  pathname,
  compact = false,
}: {
  staff: { email: string; role: 'organizer' | 'manager' };
  initials: string;
  pathname: string;
  compact?: boolean;
}) {
  return (
    <>
      {/* Brand + user — hidden in mobile compact mode (top bar already shows brand) */}
      {!compact && (
        <div className="mb-lg">
          <div className="flex items-center gap-sm mb-md">
            <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden>
              event
            </span>
            <span className="font-headline-sm text-headline-sm text-primary font-black">
              Eventar
            </span>
          </div>
          <div className="flex items-center gap-sm mt-md">
            <div
              aria-hidden
              className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-md text-label-md font-bold"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-title-lg text-title-lg text-on-surface leading-tight truncate" title={staff.email}>
                {staff.email}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant capitalize">
                {staff.role}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Primary CTA — drives the most common action from anywhere in the app */}
      <Link
        href="/events/new"
        className="bg-primary text-on-primary font-label-md text-label-md rounded-lg py-[12px] px-lg w-full mb-md hover:opacity-90 transition-opacity flex items-center justify-center gap-sm"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          add
        </span>
        New Event
      </Link>

      {/* Nav links */}
      <div className="flex-grow flex flex-col gap-xs">
        {NAV.map((item) => (
          <NavLink key={item.label} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>

      {/* Footer links */}
      <div className="mt-auto flex flex-col gap-xs border-t border-outline-variant pt-md">
        <SignOutButton className="flex items-center gap-sm p-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all duration-200 font-label-md text-label-md text-left disabled:opacity-50" />
      </div>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const base =
    'flex items-center gap-sm p-sm rounded-lg font-label-md text-label-md transition-all duration-200';
  const activeCls = 'bg-primary-container text-on-primary-container font-bold';
  const inactiveCls = 'text-on-surface-variant hover:bg-surface-container-high';
  const disabledCls = 'text-on-surface-variant opacity-50 cursor-not-allowed';

  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        title={item.disabledReason}
        className={`${base} ${disabledCls}`}
      >
        <span className="material-symbols-outlined" aria-hidden>
          {item.icon}
        </span>
        <span>{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={`${base} ${active ? activeCls : inactiveCls}`}
      aria-current={active ? 'page' : undefined}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        data-fill={active ? '1' : undefined}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function Footer() {
  return (
    <footer className="bg-surface-container-highest border-t border-outline-variant py-lg">
      <div className="flex flex-col md:flex-row justify-between items-center px-grid-margin gap-md max-w-[1440px] mx-auto text-center md:text-left">
        <p className="font-body-md text-body-md text-on-surface-variant">
          © {new Date().getFullYear()} Eventar
        </p>
        <p className="font-label-md text-label-md text-on-surface-variant">
          Internal workshop manager
        </p>
      </div>
    </footer>
  );
}
