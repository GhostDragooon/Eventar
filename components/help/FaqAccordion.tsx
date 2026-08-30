'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export type FaqItem = { id: string; question: string; answer: React.ReactNode };

export function FaqAccordion({
  items,
  defaultOpen = [],
}: {
  items: readonly FaqItem[];
  defaultOpen?: readonly string[];
}) {
  return (
    <Accordion multiple defaultValue={[...defaultOpen]} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-md">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger className="min-h-14 text-left font-title-lg text-title-lg text-on-surface hover:no-underline">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="font-body-md text-body-md text-on-surface-variant">{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
