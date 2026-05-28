import Link from 'next/link';

/**
 * Public-facing shell for anon-accessible routes: /events/[id] (register),
 * /checkin/confirm. Minimal header + footer; no auth, no nav, no avatar.
 *
 * Lifted from the Registration Confirmed / Attendee Registration mockups'
 * shared header pattern. Pages opt into asymmetric brand-panel splits
 * themselves — this shell stays neutral so it works for both desktop
 * registration and mobile confirmation views.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="w-full px-grid-margin py-lg max-w-7xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary text-[28px]" aria-hidden>
            event
          </span>
          <span className="font-headline-sm text-headline-sm text-primary font-black">
            Eventar
          </span>
        </Link>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <footer className="bg-surface-container-highest border-t border-outline-variant py-lg mt-xl">
        <div className="flex flex-col md:flex-row justify-between items-center px-grid-margin gap-md max-w-7xl mx-auto text-center md:text-left">
          <p className="font-body-md text-body-md text-on-surface-variant">
            © {new Date().getFullYear()} Eventar
          </p>
          <p className="font-label-md text-label-md text-on-surface-variant">
            Internal workshop manager
          </p>
        </div>
      </footer>
    </div>
  );
}
