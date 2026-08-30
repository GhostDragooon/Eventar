'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export function ScrollableInformationDialog({
  open,
  onOpenChange,
  title,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sections: readonly { id: string; heading: string; content: React.ReactNode }[];
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="max-w-2xl"
      footer={<Button type="button" onClick={() => onOpenChange(false)}>Close</Button>}
    >
      <div className="space-y-lg">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-heading`}>
            <h3 id={`${section.id}-heading`} className="font-title-lg text-title-lg text-on-surface">
              {section.heading}
            </h3>
            <div className="mt-sm text-on-surface-variant">{section.content}</div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
