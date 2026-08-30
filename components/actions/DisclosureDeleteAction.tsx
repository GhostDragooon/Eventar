'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function DisclosureDeleteAction({
  label,
  onDelete,
  pending = false,
}: {
  label: string;
  onDelete: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[12px] border border-outline-variant bg-surface-container-lowest">
      <button
        // ui-primitive-allow: disclosure trigger — the visible label is
        // arbitrary caller text, not action chrome, so it stays a plain
        // button rather than adopting the pill Button shape.
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between px-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span>{label}</span>
        <span className="material-symbols-outlined" aria-hidden>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="border-t border-outline-variant p-md">
          <p className="text-on-surface-variant">This action is irreversible. Confirm only after reviewing the affected record.</p>
          <div className="mt-md flex justify-end gap-sm">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
