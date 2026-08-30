'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export function InformationDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onAcknowledge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  onAcknowledge: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon="info"
      footer={<Button type="button" onClick={onAcknowledge}>Continue</Button>}
    >
      {children}
    </Dialog>
  );
}
