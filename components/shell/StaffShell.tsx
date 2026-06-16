'use client';

import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

// Patterns §8 (revised 2026-06-16) — single 3-part NAV bar with the
// brand centered, back-link on the left, identity cluster on the right:
//   [ ← Back to <parent> ]   [ Eventar (centered) ]   [ email · ⚙ · Sign out ]
//
// User direction: "EE-1 (Eventar) centered in all pages; EE-2 (back link)
// takes the EE-1 position." Same pattern lives in PublicShell so the brand
// anchor is visually identical across every surface.
//
// Implementation: CSS grid `auto | 1fr | auto` keeps the center cell true-
// centered regardless of left/right slot width. Wordmark is a /dashboard
// link (home affordance) — preserved from the prior layout.
//
// Back-link prop pair is enforced as a discriminated union so callers
// can't pass href without label or vice-versa. Both-absent = root (DB).

type StaffShellBaseProps = {
  staff: { email: string; role: 'organizer' | 'manager' };
  children: React.ReactNode;
};

type StaffShellBackProps =
  | { backHref: string; backLabel: string }
  | { backHref?: never; backLabel?: never };

export type StaffShellProps = StaffShellBaseProps & StaffShellBackProps;

export function StaffShell(props: StaffShellProps) {
  const { staff, children, backHref, backLabel } = props;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-on-surface">
      {/* 3-part NAV bar — grid keeps the wordmark center-aligned regardless
          of left/right slot width. Not sticky; scrolls with the page. */}
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

        {/* Center slot: brand. Doubles as a home affordance — /dashboard is
            the staff root, so clicking from any page returns there. */}
        <Link
          href="/dashboard"
          className="justify-self-center font-bold text-[15px] text-on-surface hover:opacity-90 transition-opacity tracking-tight"
        >
          Eventar
        </Link>

        {/* Right slot: email · ⚙ · Sign out */}
        <div className="flex items-center gap-sm justify-self-end">
          <span className="text-on-surface-variant" title={staff.email}>
            {staff.email}
          </span>
          <span aria-hidden className="text-outline-variant">·</span>
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
          <span aria-hidden className="text-outline-variant">·</span>
          <SignOutButton className="text-tertiary hover:underline disabled:opacity-50" />
        </div>
      </nav>

      {/* Page canvas */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-grid-margin pb-xxl">
        {children}
      </main>
    </div>
  );
}
