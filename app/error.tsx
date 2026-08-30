'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Branded error boundary. Client component by Next contract; keeps the
// design language even when a page render throws. The digest (never the raw
// message — it can carry internals) is shown so support has a handle.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server logs carry the full stack; this is the client-side breadcrumb.
    console.error('[app error boundary]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-on-surface px-grid-margin text-center">
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] text-[color:var(--error)] mb-sm">
        Something broke
      </p>
      <h1 className="text-[calc(30px*var(--text-scale))] font-extrabold tracking-[-0.03em] mb-sm">
        We hit an unexpected error.
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant mb-lg max-w-[440px]">
        Your data is safe. Try again — if it keeps happening, tell the organiser
        {error.digest ? ` and quote error ${error.digest}` : ''}.
      </p>
      <div className="flex items-center gap-sm">
        <Button
          type="button"
          onClick={reset}
          className="gap-xs font-label-md text-label-md py-sm px-lg"
        >
          <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>refresh</span>
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center gap-xs border border-outline-variant text-on-surface font-label-md text-label-md rounded-full py-sm px-lg hover:bg-surface-container-high transition-colors"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
