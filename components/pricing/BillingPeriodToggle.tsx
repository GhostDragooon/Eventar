'use client';

import { Button } from '@/components/ui/button';

export type BillingPeriod = 'monthly' | 'annual';

export function BillingPeriodToggle({ value, onChange }: { value: BillingPeriod; onChange: (value: BillingPeriod) => void }) {
  return (
    <div role="group" aria-label="Billing period" className="inline-flex rounded-lg bg-surface-container p-xs">
      {(['monthly', 'annual'] as const).map((period) => (
        <Button
          key={period}
          type="button"
          variant={value === period ? 'default' : 'ghost'}
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className="rounded-lg px-lg capitalize"
        >
          {period}
        </Button>
      ))}
    </div>
  );
}
