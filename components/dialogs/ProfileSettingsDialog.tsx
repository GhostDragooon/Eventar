'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export function ProfileSettingsDialog({
  open,
  onOpenChange,
  children,
  onSave,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  onSave: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Profile settings"
      description="Update the fields available to your current role."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={onSave}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
