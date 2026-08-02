import Link from 'next/link';
import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = { title: 'Page not found' };

// Branded 404 — the stock Next page is a dead giveaway. Same site chrome,
// clear ways forward for both audiences (attendee → events, staff → sign in).
export default function NotFound() {
  return (
    <SiteShell active="home">
      <div className="max-w-[560px] mx-auto px-grid-margin py-xxl text-center">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] text-[color:var(--on-primary-container)] mb-sm">
          404
        </p>
        <h1 className="text-[calc(34px*var(--text-scale))] font-extrabold tracking-[-0.03em] text-on-surface mb-sm">
          This page doesn&apos;t exist.
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">
          The link may be old, or the event it pointed at was removed. If you followed a
          link from an email, double-check you opened the most recent one.
        </p>
        <div className="flex items-center justify-center gap-sm">
          <Link
            href="/events"
            className="inline-flex items-center gap-xs bg-primary text-on-primary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
          >
            Upcoming events
            <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>arrow_forward</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-xs border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg py-sm px-lg hover:bg-surface-container-high transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
