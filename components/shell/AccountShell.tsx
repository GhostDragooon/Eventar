'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';
import { signOutAndLeave } from '@/lib/signOut';
import { cn } from '@/lib/utils';

// Attendee portal shell (UX-02 re-cut). Picks 1b 2a 3b 4a 5a 6a 7a, docs/plans/mvp/PICKS.md, 2026-11-01.
// Nav labels and order: Doctrine 2026-10-30 section 2 (Check-in, Registrations, Events, History, Account).
//
// 5a: only Events and Account have a page today. Check-in, Registrations and History render as inert "Soon" rows
// (aria-disabled, not links), as StaffShell's NavRow does for an unbuilt surface. When the Attendee surfaces card
// lands, give each row its `href` here and nothing else changes. Until History exists, /account/record is reached
// from the Account page (AccountClient links it).
//
// The brand links to Events, the one list-like page that works; point it at Registrations when that exists.
const NAV: { label: string; icon: string; href: string | null; match: string }[] = [
  { label: 'Check-in', icon: 'how_to_reg', href: null, match: '' },
  { label: 'Registrations', icon: 'confirmation_number', href: null, match: '' },
  { label: 'Events', icon: 'event', href: '/events', match: '/events' },
  { label: 'History', icon: 'history', href: null, match: '' },
  { label: 'Account', icon: 'account_circle', href: '/account', match: '/account' },
];

const isCurrent = (pathname: string, match: string) => match !== '' && (pathname === match || pathname.startsWith(`${match}/`));

// One sign-out for the rail and the onboarding bar (lib/signOut.ts): leaves only after the server revoke worked.
function useSignOut() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    setError(null);
    setError(await signOutAndLeave('/'));
    setPending(false);
  };
  return { signOut, error, pending };
}

function SignOutError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="m-0 px-md text-[calc(13px*var(--text-scale))] text-error">
      {message}
    </p>
  ) : null;
}

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn('material-symbols-outlined', className)}>
      {name}
    </span>
  );
}

const SOON = 'text-on-surface-variant/45';

function RailRow({ item, current }: { item: (typeof NAV)[number]; current: boolean }) {
  const base = 'nav-item flex min-h-11 w-full items-center gap-sm rounded-lg px-md text-[calc(14px*var(--text-scale))] font-medium';
  const inner = (
    <>
      <Icon name={item.icon} className="text-[calc(20px*var(--text-scale))]" />
      <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
    </>
  );
  if (!item.href) {
    return (
      <span aria-disabled="true" title={`${item.label} is coming soon`} className={cn(base, 'cursor-default', SOON)}>
        {inner}
        <span className="rounded-full border border-outline-variant px-sm py-[1px] text-[calc(10px*var(--text-scale))] font-semibold text-on-surface-variant">
          Soon
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(base, current ? 'bg-primary-container font-semibold text-on-primary-container' : 'text-on-surface hover:bg-surface-container-high')}
    >
      {inner}
    </Link>
  );
}

// 1b: columns sized to their labels (`auto`), not equal fifths, so "Registrations" keeps one line at 320 px.
function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Portal"
      className="fixed inset-x-0 bottom-0 z-10 grid border-t border-outline-variant bg-surface px-xs pb-[max(4px,env(safe-area-inset-bottom))] pt-xs md:hidden"
      style={{ gridTemplateColumns: `repeat(${NAV.length}, auto)`, justifyContent: 'space-between' }}
    >
      {NAV.map((item) => {
        const current = item.href !== null && isCurrent(pathname, item.match);
        const cls = cn(
          'nav-item relative flex min-h-12 min-w-11 flex-col items-center justify-center gap-[2px] whitespace-nowrap px-[2px] text-[calc(11px*var(--text-scale))] font-semibold',
          current ? 'text-primary-ink' : 'text-on-surface-variant',
        );
        const inner = (
          <>
            {/* UX-02 review: the current tab needs a cue that is not colour (WCAG 1.4.1), so it gets a 2 px top rule. */}
            {current && <span aria-hidden data-current-rule className="absolute inset-x-1 -top-xs h-[2px] rounded-full bg-primary-ink" />}
            <Icon name={item.icon} className="text-[calc(22px*var(--text-scale))]" />
            <span>{item.label}</span>
            {/* The rail shows a Soon chip; a phone user cannot hover a title, so the bar prints it. Solid colour: the word is the explanation, the dimmed label is not. */}
            {!item.href && (
              <>
                <span aria-hidden className="text-[calc(10px*var(--text-scale))] font-medium leading-none text-on-surface-variant">
                  Soon
                </span>
                <span className="sr-only"> (coming soon)</span>
              </>
            )}
          </>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} aria-current={current ? 'page' : undefined} className={cls}>
            {inner}
          </Link>
        ) : (
          <span key={item.label} aria-disabled="true" title={`${item.label} is coming soon`} className={cn(cls, SOON)}>
            {inner}
          </span>
        );
      })}
    </nav>
  );
}

const SKIP =
  'sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded-full focus:bg-primary focus:px-md focus:py-sm focus:text-[calc(13px*var(--text-scale))] focus:font-semibold focus:text-on-primary';

export function AccountShell({
  children,
  variant = 'portal',
  email,
}: {
  children: React.ReactNode;
  /** 'onboarding' (4a): /account/complete, no portal nav, brand + email + Sign out only (spec FR-007, FR-010). */
  variant?: 'portal' | 'onboarding';
  /** Shown in the onboarding bar. */
  email?: string;
}) {
  const pathname = usePathname() ?? '';
  const { signOut, error: signOutError, pending: signingOut } = useSignOut();

  if (variant === 'onboarding') {
    return (
      <div className="app-atmo flex min-h-screen flex-col text-on-surface">
        <a href="#main-content" className={SKIP}>
          Skip to content
        </a>
        <header className="flex min-h-14 items-center justify-between gap-md border-b border-outline-variant bg-surface px-md">
          <BrandMark href={null} />
          <span className="flex min-w-0 items-center gap-sm text-[calc(13px*var(--text-scale))] text-on-surface-variant">
            {email && <span className="hidden truncate sm:inline">{email}</span>}
            <button
              // ui-primitive-allow: bar action beside the brand, an outline pill (the rail's Sign out is a borderless nav row)
              type="button"
              disabled={signingOut}
              onClick={signOut}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-outline-variant px-md font-medium text-on-surface hover:bg-surface-container-high"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </span>
        </header>
        {signOutError && (
          <div className="border-b border-outline-variant bg-surface py-xs">
            <SignOutError message={signOutError} />
          </div>
        )}
        {email && (
          <p className="truncate border-b border-outline-variant bg-surface px-md py-xs text-[calc(12px*var(--text-scale))] text-on-surface-variant sm:hidden">
            Signed in as {email}
          </p>
        )}
        <main id="main-content" tabIndex={-1} className="w-full flex-1">
          {children}
        </main>
        <SiteFooter links={false} />
      </div>
    );
  }

  return (
    <div className="app-atmo flex min-h-screen w-full flex-col text-on-surface">
      <a href="#main-content" className={SKIP}>
        Skip to content
      </a>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          aria-label="Your Eventar portal"
          className="hidden shrink-0 bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:w-[232px] md:flex-col md:self-start md:border-r md:border-outline-variant"
        >
          <div className="flex h-full flex-col gap-xs overflow-y-auto p-md">
            <div className="pb-sm">
              <BrandMark compact href="/events" />
            </div>
            <nav aria-label="Primary" className="flex flex-col gap-xs">
              {NAV.map((item) => (
                <RailRow key={item.label} item={item} current={item.href !== null && isCurrent(pathname, item.match)} />
              ))}
            </nav>
            <button
              // ui-primitive-allow: rail row, shaped like the nav rows above it (2a: quiet row under the nav)
              type="button"
              disabled={signingOut}
              onClick={signOut}
              className="nav-item mt-xs flex min-h-11 w-full items-center gap-sm rounded-lg px-md text-[calc(14px*var(--text-scale))] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              <Icon name="logout" className="text-[calc(20px*var(--text-scale))]" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            <SignOutError message={signOutError} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-0">
          <main id="main-content" tabIndex={-1} className="w-full flex-1">
            {children}
          </main>
          <SiteFooter links={false} />
        </div>
      </div>
      <TabBar pathname={pathname} />
    </div>
  );
}
