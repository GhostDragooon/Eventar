'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

/**
 * Stricter than ConfirmDialog(tone="danger"): the confirm action stays
 * disabled until the operator checks an explicit acknowledgement. Reach for
 * this only where a plain confirm is too easy to click through — ConfirmDialog
 * covers ordinary deletes (see DashboardWorkstation) and is left alone.
 */
export function DestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  acknowledgement,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  acknowledgement: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setAccepted(false);
        onOpenChange(value);
      }}
      title={title}
      description={description}
      icon="warning"
      iconTone="error"
      footer={
        <>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!accepted || pending} onClick={onConfirm}>
            {pending ? 'Working…' : 'Confirm'}
          </Button>
        </>
      }
    >
      <label className="flex items-start gap-md rounded-[12px] bg-error-container p-md text-on-error-container">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-xs size-5 accent-error"
        />
        <span>{acknowledgement}</span>
      </label>
    </Dialog>
  );
}
