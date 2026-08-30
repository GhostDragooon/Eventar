import type { BillingPeriod } from './BillingPeriodToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PricingTier = {
  id: string;
  name: string;
  description: string;
  monthlyLabel: string;
  annualLabel: string;
  features: readonly string[];
  highlighted?: boolean;
  badge?: string;
};

export function PricingComparison({
  tiers,
  billing,
  onChoose,
}: {
  tiers: readonly PricingTier[];
  billing: BillingPeriod;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="grid gap-md lg:grid-cols-3">
      {tiers.map((tier) => (
        <article
          key={tier.id}
          className={cn(
            'relative flex flex-col rounded-[20px] border p-lg shadow-sm',
            tier.highlighted ? 'border-2 border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container-lowest text-on-surface',
          )}
        >
          {tier.badge && (
            <span className={cn('mb-md w-fit rounded-full px-sm py-xs font-label-md text-label-md', tier.highlighted ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>
              {tier.badge}
            </span>
          )}
          <h3 className="font-headline-sm text-headline-sm">{tier.name}</h3>
          <p className={cn('mt-xs', tier.highlighted ? 'text-on-primary-container' : 'text-on-surface-variant')}>{tier.description}</p>
          <p className="my-lg font-headline-md text-headline-md">{billing === 'monthly' ? tier.monthlyLabel : tier.annualLabel}</p>
          <ul className="mb-lg flex-1 space-y-sm">
            {tier.features.map((feature) => (
              <li key={feature} className="flex gap-sm">
                <span className="material-symbols-outlined text-success" aria-hidden>check_circle</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <Button type="button" variant={tier.highlighted ? 'default' : 'outline'} onClick={() => onChoose(tier.id)}>
            Choose {tier.name}
          </Button>
        </article>
      ))}
    </div>
  );
}
