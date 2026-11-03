'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOutAndLeave } from '@/lib/signOut';

// Signed-in Account disclosure menu — replaces the plain "Account" link on
// SiteShell / PublicShell / LandingNav / LandingAuthPill (2026-09-21
// two-persona funnel instruction §4.2). Same outside-click + Escape idiom as
// AgendaSection's MoreKindsMenu (components/event-form/AgendaSection.tsx:
// MoreKindsMenu) — the one existing menu with full close behaviour —
// combined with RecordActionsMenu's labelled-item-list shape.
//
// Item set depends on account completeness (Ivan, 2026-09-21
// AskUserQuestion): an incomplete account only sees Account + Sign
// out — Record, Profile, and Claim past events all point
// at surfaces that would just bounce back to /account/complete, so they're
// hidden rather than shown-then-redirected. Claim past events is itself
// conditional on unlinkedCount > 0 (Ivan's second call).
//
// Trigger keeps shrink-0 whitespace-nowrap always (previously only on
// SiteShell) — §4.2's explicit "Account control stays shrink-0" mobile
// requirement applies to every consumer, not just one shell.
const TRIGGER_CLASS =
  'shrink-0 whitespace-nowrap rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export function AccountMenu({
  complete,
  unlinkedCount = 0,
  active = false,
}: {
  complete: boolean;
  unlinkedCount?: number;
  /** Marks the trigger `aria-current="page"` — parity with the plain-Link
   * behaviour this menu replaces (SiteShell's `active === 'account'`). */
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!signingOut && !rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !signingOut) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, signingOut]);

  const items: { label: string; href: string }[] = complete
    ? [
        { label: 'History', href: '/account/record' },
        { label: 'Profile', href: '/account/profile' },
        { label: 'Account', href: '/account' },
        ...(unlinkedCount > 0 ? [{ label: 'Claim past events', href: '/account/claim' }] : []),
      ]
    : [{ label: 'Account', href: '/account' }];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          setSignOutError(null);
          setOpen((v) => !v);
        }}
        className={TRIGGER_CLASS}
      >
        Account
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-xs w-64 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-xs shadow-lg">
        <div role="menu" aria-label="Account menu">
            {items.map((item) => (
              <Link
                // ui-primitive-allow: menu item inside an open AccountMenu
                // popover, not a standalone action — same convention as
                // RecordActionsMenu / WorkspaceSwitcher's listbox options.
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-sm py-sm text-body-md text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {item.label}
              </Link>
            ))}
            <div className="my-xs h-px bg-outline-variant" role="separator" />
            <button
              // ui-primitive-allow: menu item inside an open AccountMenu
              // popover, not a standalone action — same convention as the
              // Link items above and RecordActionsMenu's menu-row buttons.
              type="button"
              role="menuitem"
              disabled={signingOut}
              // Stays open on failure so the error and the retry are in view (lib/signOut.ts).
              onClick={async () => {
                setSigningOut(true);
                setSignOutError(null);
                setSignOutError(await signOutAndLeave('/'));
                setSigningOut(false);
              }}
              className="block w-full rounded-lg px-sm py-sm text-left text-body-md text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
        </div>
          {/* Outside role="menu" (ARIA allows only items there). */}
          {signOutError && (
            <p role="alert" className="m-0 px-sm py-xs text-body-md text-error">
              {signOutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
