'use client';

import { useState } from 'react';
import { BillingPeriodToggle, type BillingPeriod } from '@/components/pricing/BillingPeriodToggle';
import { useToast } from '@/components/ui/toast';
import { PricingComparison, type PricingTier } from '@/components/pricing/PricingComparison';

const TIERS: PricingTier[] = [
  {
    id: 'essential',
    name: 'Essential',
    description: 'For small teams running CPD events.',
    monthlyLabel: 'Free',
    annualLabel: 'Free',
    features: [
      'Up to 50 registrations per event',
      'Email confirmations & reminders',
      'QR check-in',
      'Basic analytics',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For organisations with accreditation needs.',
    monthlyLabel: 'HK$800/mo',
    annualLabel: 'HK$680/mo',
    features: [
      'Unlimited registrations',
      'Multi-body CPD accreditation',
      'Evidence export & compliance',
      'Priority support',
    ],
    highlighted: true,
    badge: 'Most popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For accrediting bodies and large institutions.',
    monthlyLabel: 'Contact us',
    annualLabel: 'Contact us',
    features: [
      'Everything in Professional',
      'Custom integrations',
      'Dedicated account manager',
      'SLA & data residency',
    ],
  },
];

export function PricingClient() {
  const [billing, setBilling] = useState<BillingPeriod>('annual');
  const { toast } = useToast();

  function handleChoose(id: string) {
    const tier = TIERS.find((t) => t.id === id);
    toast('neutral', `${tier?.name ?? id} — coming soon! We’ll notify you when this plan is available.`);
  }

  return (
    <>
      <div className="mb-lg flex justify-center">
        <BillingPeriodToggle value={billing} onChange={setBilling} />
      </div>
      <PricingComparison tiers={TIERS} billing={billing} onChoose={handleChoose} />
    </>
  );
}
