'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import { Facts, PublicCardPreview } from './parts';

// The production Dialog (components/ui/Dialog.tsx), opened for real: focus trap, Escape, scrim click and the
// open animation are the shipped ones, not a drawing of them. Nothing is wired: both buttons just close it.
export function LiveDialog({ variant }: { variant: 'confirm' | 'review' }) {
  const [open, setOpen] = useState(false);
  const review = variant === 'review';
  return (
    <>
      <Button variant="outline" className="min-h-11 px-md" onClick={() => setOpen(true)}>
        Open the real dialog
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={review ? 'Review and publish' : 'Publish this event?'}
        description={review ? 'This is what happens when you publish.' : 'Heart Failure in Primary Care: 2026 Update'}
        footer={
          <>
            <Button variant="outline" className="min-h-11 px-md" onClick={() => setOpen(false)}>Keep editing</Button>
            <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!" onClick={() => setOpen(false)}>Publish event</Button>
          </>
        }
      >
        <div className="space-y-md">
          <Facts />
          {review && <PublicCardPreview />}
        </div>
      </Dialog>
    </>
  );
}
