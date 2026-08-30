/**
 * Soft conflict with components/landing/LandingHero.tsx — see
 * docs/ui-port/CATEGORY_12_STATUS.md. Library-only.
 */

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FeaturePoint = { id: string; label: string };

export function FeatureShowcase({
  eyebrow,
  title,
  description,
  features,
  action,
  visual,
}: {
  eyebrow: string;
  title: string;
  description: string;
  features: readonly FeaturePoint[];
  action: { label: string; href: string };
  visual: React.ReactNode;
}) {
  return (
    <section className="grid items-center gap-xl px-grid-margin py-xxl lg:grid-cols-2">
      <div className="space-y-lg">
        <span className="inline-flex rounded-full bg-primary-container px-sm py-xs font-label-md text-label-md text-on-primary-container">{eyebrow}</span>
        <div className="space-y-sm">
          <h1 className="font-display text-display text-on-surface">{title}</h1>
          <p className="max-w-2xl font-body-lg text-body-lg text-on-surface-variant">{description}</p>
        </div>
        <ul className="grid gap-sm sm:grid-cols-2">
          {features.map((feature) => (
            <li key={feature.id} className="flex items-start gap-sm text-on-surface">
              <span className="material-symbols-outlined text-success" aria-hidden>check_circle</span>
              {feature.label}
            </li>
          ))}
        </ul>
        <Link href={action.href} className={cn(buttonVariants({ variant: 'default' }), 'px-lg')}>{action.label}</Link>
      </div>
      <div className="relative min-h-80 rounded-[20px] bg-surface-container p-lg">{visual}</div>
    </section>
  );
}
