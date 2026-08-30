/**
 * No approved testimonials exist yet (Eventar is pre-launch) — see
 * docs/ui-port/CATEGORY_12_STATUS.md. Library-only.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type ApprovedTestimonial = { id: string; quote: string; name: string; role: string; approvalReference: string };

export function TestimonialCarousel({ items }: { items: readonly ApprovedTestimonial[] }) {
  const [index, setIndex] = useState(0);

  if (!items.length) {
    return (
      <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl text-center">
        <p className="text-on-surface-variant">No approved testimonials are available.</p>
      </section>
    );
  }

  const item = items[index];

  return (
    <section aria-roledescription="carousel" aria-label="Testimonials" className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-xl">
      <blockquote className="font-headline-sm text-headline-sm text-on-surface">&ldquo;{item.quote}&rdquo;</blockquote>
      <footer className="mt-md">
        <strong className="text-on-surface">{item.name}</strong>
        <span className="ml-xs text-on-surface-variant">{item.role}</span>
        <span className="sr-only">Approval reference {item.approvalReference}</span>
      </footer>
      <div className="mt-lg flex items-center justify-between">
        <Button type="button" variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
        <span aria-live="polite" className="text-on-surface-variant">{index + 1} of {items.length}</span>
        <Button type="button" variant="outline" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
      </div>
    </section>
  );
}
