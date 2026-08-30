'use client';

import { useState } from 'react';
import type { PricingTier } from './PricingComparison';
import type { BillingPeriod } from './BillingPeriodToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ExpandablePlanPicker({
  tiers,
  billing,
  value,
  onChange,
  onContinue,
}: {
  tiers: readonly PricingTier[];
  billing: BillingPeriod;
  value: string | null;
  onChange: (id: string) => void;
  onContinue: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(value);

  return (
    <section className="space-y-md">
      {tiers.map((tier) => {
        const selected = tier.id === value;
        const open = tier.id === expanded;
        return (
          <article key={tier.id} className={cn('rounded-[12px] border', selected ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container-lowest text-on-surface')}>
            <button
              // ui-primitive-allow: disclosure trigger, not action-button chrome — same convention as ShareLinkControl
              type="button"
              aria-expanded={open}
              onClick={() => {
                setExpanded(open ? null : tier.id);
                onChange(tier.id);
              }}
              className="flex min-h-14 w-full items-center gap-md p-md text-left focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <span aria-hidden className={selected ? 'grid size-5 place-items-center rounded-full border-4 border-primary bg-surface-container-lowest' : 'size-5 rounded-full border-2 border-outline'} />
              <span className="min-w-0 flex-1">
                <strong className="block">{tier.name}</strong>
                <small className={selected ? 'text-on-primary-container' : 'text-on-surface-variant'}>{tier.description}</small>
              </span>
              <strong>{billing === 'monthly' ? tier.monthlyLabel : tier.annualLabel}</strong>
              <span className="material-symbols-outlined" aria-hidden>{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && (
              <div className="border-t border-outline-variant p-md">
                <ul className="space-y-xs">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-sm">
                      <span className="material-symbols-outlined text-success" aria-hidden>check</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}
      <p className="font-body-md text-body-md text-on-surface-variant">
        Package names, prices, billing terms and availability must be supplied from the approved commercial source.
      </p>
      <Button type="button" disabled={!value} onClick={onContinue} className="w-full">Continue</Button>
    </section>
  );
}
