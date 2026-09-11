import { SiteShell } from '@/components/shell/SiteShell';
import { PricingClient } from './PricingClient';

export const metadata = {
  title: 'Pricing — Eventar',
  description: 'Plans and pricing for Eventar CPD event management.',
};

export default function PricingPage() {
  return (
    <SiteShell active="home">
      <div className="mx-auto max-w-5xl px-grid-margin py-xxl">
        <header className="mb-xl text-center">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Plans &amp; Pricing</h1>
          <p className="mt-sm font-body-lg text-body-lg text-on-surface-variant">
            Simple pricing for CPD event management. Start free, upgrade when you need to.
          </p>
        </header>
        <PricingClient />
      </div>
    </SiteShell>
  );
}
