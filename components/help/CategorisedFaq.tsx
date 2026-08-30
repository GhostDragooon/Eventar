'use client';

import { useState } from 'react';
import { FaqAccordion, type FaqItem } from './FaqAccordion';
import { cn } from '@/lib/utils';

export type FaqCategory = { id: string; label: string; items: readonly FaqItem[] };

export function CategorisedFaq({ categories }: { categories: readonly FaqCategory[] }) {
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const category = categories.find((value) => value.id === active);

  return (
    <section className="space-y-md">
      <div role="tablist" aria-label="Help categories" className="flex gap-xs overflow-auto border-b border-outline-variant">
        {categories.map((value) => (
          <button
            // ui-primitive-allow: tab control, same convention as TeamTabs / NotificationCentre
            key={value.id}
            type="button"
            role="tab"
            aria-selected={active === value.id}
            onClick={() => setActive(value.id)}
            className={cn('min-h-11 shrink-0 px-md', active === value.id ? 'border-b-2 border-primary text-primary-ink' : 'text-on-surface-variant')}
          >
            {value.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {category && category.items.length > 0 ? (
          <FaqAccordion items={category.items} />
        ) : (
          <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl text-center">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant" aria-hidden>help</span>
            <p className="mt-sm text-on-surface-variant">No help articles are available in this category.</p>
          </div>
        )}
      </div>
    </section>
  );
}
