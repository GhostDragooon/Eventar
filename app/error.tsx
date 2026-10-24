'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isOrganiserWorkspacePath } from '@/lib/authDoor';

// Branded error boundary. Client component by Next contract; keeps the
// design language even when a page render throws. The digest (never the raw
// message — it can carry internals) is shown so support has a handle.
//
// Two audiences (Q32). A crash on an organiser page used to land an organiser on
// the public "tell the organiser" page with a Home link into the marketing site
// (core-UX finding D, 2026-10-01). Behind the organiser gate the same boundary
// speaks to them directly: no "tell the organiser", and the way out is Programme,
// which lists drafts since CX-04 (it was Manage while Programme hid them).
// /login and an invite link are organiser-DOOR paths with no workspace behind
// them, so they keep the public wording and the Home link.
//
// "Try again" is unstable_retry, not reset: reset only clears the error state and
// re-renders the cached server payload, so a failed server render came straight
// back and the button looked dead. unstable_retry refreshes the data first.
// What the last "Try again" was asked about. Module scope on purpose: Next's boundary
// UNMOUNTS the fallback and mounts a fresh one when a retried render throws again
// (read from ErrorBoundaryHandler in next 16.2.12 and confirmed by a jsdom run against
// the real boundary, dev-lens round 2), so component state resets on exactly the event
// it needs to remember. Keyed on path + digest (the same failure) and forgotten after a
// minute, so an unrelated later error does not inherit "still".
let lastRetry: { path: string | null; digest: string | undefined } | null = null;
let forgetRetry: ReturnType<typeof setTimeout> | undefined;
const RETRY_MEMORY_MS = 60_000;

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const pathname = usePathname();
  const organiser = isOrganiserWorkspacePath(pathname);
  // A retry that fails again re-renders the same page, so without a word "Try again"
  // looks dead (user-lens 2026-10-02, still true on the live boundary 2026-10-09).
  // Decided once, at mount.
  const [stillFailing] = useState(
    () => lastRetry !== null && lastRetry.path === pathname && lastRetry.digest === error.digest,
  );

  // The fallback is a fresh mount after a failed retry, so focus would otherwise land on
  // <body> and a keyboard or screen-reader user gets no sign anything happened.
  const stillRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    stillRef.current?.focus();
  }, []);

  useEffect(() => {
    // Server logs carry the full stack; this is the client-side breadcrumb.
    console.error('[app error boundary]', error.digest ?? error.message);
  }, [error]);

  const copy = organiser
    ? {
        heading: 'This page hit an unexpected error.',
        body: `If you were saving or publishing, check your events before you repeat it, so nothing is created twice.${error.digest ? ` Reference ${error.digest}: quote it if you ask for help.` : ''}`,
        exit: { href: '/dashboard', label: 'Back to Programme' },
      }
    : {
        heading: 'We hit an unexpected error.',
        body: `Your data is safe. Try again. If it keeps happening, tell the organiser${error.digest ? ` and quote error ${error.digest}` : ''}.`,
        exit: { href: '/', label: 'Home' },
      };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background text-on-surface px-grid-margin text-center">
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] text-[color:var(--error)] mb-sm">
        Something broke
      </p>
      <h1 className="text-[calc(30px*var(--text-scale))] font-extrabold tracking-[-0.03em] mb-sm">
        {copy.heading}
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant mb-lg max-w-[440px]">{copy.body}</p>
      {stillFailing && (
        <p ref={stillRef} tabIndex={-1} role="alert" className="font-body-md text-body-md text-on-surface mb-md outline-none">
          Still not working. Try again in a moment, or go back.
        </p>
      )}
      <div className="flex items-center gap-sm">
        {/* text-on-primary!: tailwind-merge reads `text-label-md` (a font size) as
            a text colour and drops the Button's own `text-on-primary`; the `!`
            keeps both. Same workaround as MagicLinkSignInForm. */}
        <Button
          type="button"
          onClick={() => {
            lastRetry = { path: pathname, digest: error.digest };
            clearTimeout(forgetRetry);
            forgetRetry = setTimeout(() => {
              lastRetry = null;
            }, RETRY_MEMORY_MS);
            unstable_retry();
          }}
          className="min-h-11 gap-xs font-label-md text-label-md text-on-primary! py-sm px-lg"
        >
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>refresh</span>
          Try again
        </Button>
        <Link
          href={copy.exit.href}
          className="inline-flex min-h-11 items-center gap-xs border border-outline-variant text-on-surface font-label-md text-label-md rounded-full py-sm px-lg hover:bg-surface-container-high transition-colors"
        >
          {copy.exit.label}
        </Link>
      </div>
    </main>
  );
}
