'use client';

import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

// Patterns §8 — single 3-part NAV bar:
//   [ Eventar  ← Back to <parent> ]   (empty middle)   [ email · ⚙ · Sign out ]
//
// The "brand" anchor stays as the leftmost element (mockup-confirmed; the
// patterns doc's "Remove any old topbar branding (M3)" instruction targets
// the Material-Design-3 sidebar logo treatment we ripped out, not all
// branding). It doubles as a home affordance — `/dashboard` is the staff
// root, so a click on the wordmark from anywhere returns there.
//
// Back-link prop pair is enforced as a discriminated union so callers can't
// pass href without label or vice-versa. Both-absent = root pages (DB).

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
      {/* 3-part NAV bar — flex row, NOT sticky, scrolls with the page. */}
      <nav
        aria-label="Primary"
        className="flex flex-wrap items-center justify-between gap-md border-b border-outline-variant px-grid-margin py-md text-[13px]"
      >
        {/* Left cluster: brand + optional back link */}
        <div className="flex flex-wrap items-center gap-md">
          <Link
            href="/dashboard"
            className="font-semibold text-on-surface hover:opacity-90 transition-opacity"
          >
            Eventar
          </Link>
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

        {/* Right cluster: email · ⚙ · Sign out */}
        <div className="flex flex-wrap items-center gap-sm">
          <span className="text-on-surface-variant" title={staff.email}>
            {staff.email}
          </span>
          <span aria-hidden className="text-outline-variant">·</span>
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex items-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              settings
            </span>
          </Link>
          <span aria-hidden className="text-outline-variant">·</span>
          <SignOutButton className="text-primary hover:underline disabled:opacity-50" />
        </div>
      </nav>

      {/* Page canvas */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-grid-margin pb-xxl">
        {children}
      </main>
    </div>
  );
}
