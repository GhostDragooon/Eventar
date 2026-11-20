import Link from 'next/link';
import { SiteShell } from '@/components/shell/SiteShell';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Page not found' };

// Branded 404 — the stock Next page is a dead giveaway. Same site chrome,
// clear ways forward for both audiences (attendee → events, staff → sign in).
export default function NotFound() {
  return (
    <SiteShell>
      <div className="max-w-[560px] mx-auto px-grid-margin py-xxl text-center">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] text-[color:var(--on-primary-container)] mb-sm">
          404
        </p>
        <h1 className="text-[calc(2.125rem*var(--text-scale))] font-extrabold tracking-[-0.03em] text-on-surface mb-sm">
          This page doesn’t exist.
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">
          The link may be old, or the event it pointed at was removed. If you followed a
          link from an email, double-check you opened the most recent one.
        </p>
        <div className="flex items-center justify-center gap-sm">
          <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 px-lg')}>
            Home
          </Link>
          <Link href="/events" className={cn(buttonVariants({ variant: 'default' }), 'min-h-11 gap-xs px-lg')}>
            Upcoming events
            <span className="material-symbols-outlined text-[calc(1rem*var(--text-scale))]" aria-hidden>arrow_forward</span>
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
