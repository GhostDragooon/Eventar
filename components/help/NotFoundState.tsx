/**
 * Generic 404/recovery content block — NOT wired as the site's real
 * app/not-found.tsx, which already exists, is SiteShell-wrapped, and carries
 * Eventar-specific copy and recovery routes. Wiring this in its place would
 * mean either dropping SiteShell (same objection as the earlier AuthShell
 * flag) or duplicating it here. Kept as a library component for a narrower
 * "not found" panel nested inside an already-shelled page, should one ever
 * need it — not for the top-level 404.
 */

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type RecoveryAction = { label: string; href: string; primary?: boolean };

export function NotFoundState({
  title = 'Page not found',
  description = 'The requested page could not be found.',
  actions,
}: {
  title?: string;
  description?: string;
  actions: readonly RecoveryAction[];
}) {
  return (
    <main className="grid min-h-[70dvh] place-items-center bg-surface p-grid-margin">
      <section className="relative w-full max-w-3xl overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl text-center shadow-sm">
        <span className="pointer-events-none absolute inset-0 grid place-items-center font-display text-[12rem] text-surface-container-highest" aria-hidden>404</span>
        <div className="relative space-y-md">
          <span className="material-symbols-outlined text-[40px] text-primary-ink" aria-hidden>travel_explore</span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">{description}</p>
          <div className="flex flex-wrap justify-center gap-sm">
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className={cn(buttonVariants({ variant: action.primary ? 'default' : 'outline' }), 'px-lg')}>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
