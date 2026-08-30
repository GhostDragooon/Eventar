/**
 * Overlaps components/landing/HowItWorks.tsx conceptually — see
 * docs/ui-port/CATEGORY_12_STATUS.md. Library-only.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ServiceCard = { id: string; icon: string; title: string; description: string; action: { label: string; href: string } };

export function ServiceCardCarousel({ cards }: { cards: readonly ServiceCard[] }) {
  const [index, setIndex] = useState(0);
  if (!cards.length) return null;
  const card = cards[index];

  return (
    <section aria-roledescription="carousel" aria-label="Eventar services" className="space-y-md">
      <article className="mx-auto flex min-h-80 max-w-md flex-col rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl shadow-sm">
        <span className="material-symbols-outlined text-[40px] text-primary-ink" aria-hidden>{card.icon}</span>
        <h2 className="mt-md font-headline-md text-headline-md text-on-surface">{card.title}</h2>
        <p className="mt-sm flex-1 text-on-surface-variant">{card.description}</p>
        <Link href={card.action.href} className={cn(buttonVariants({ variant: 'default' }), 'mt-lg px-lg')}>{card.action.label}</Link>
      </article>
      <div className="flex items-center justify-center gap-md">
        <Button type="button" variant="outline" size="icon" className="size-11" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous service">←</Button>
        <span aria-live="polite" className="text-on-surface-variant">{index + 1} of {cards.length}</span>
        <Button type="button" variant="outline" size="icon" className="size-11" disabled={index === cards.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next service">→</Button>
      </div>
    </section>
  );
}
