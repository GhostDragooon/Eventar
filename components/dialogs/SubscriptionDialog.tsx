'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export function SubscriptionDialog({
  open,
  onOpenChange,
  onReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();

  function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    onReady(email);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Email updates"
      description="Choose whether to submit this address to the approved subscription service."
      footer={<Button type="button" onClick={submit}>Continue</Button>}
    >
      <div className="space-y-xs">
        <label htmlFor={emailId} className="text-on-surface">Email address</label>
        <Input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11" aria-invalid={Boolean(error) || undefined} />
      </div>
      {error && <p role="alert" className="mt-sm text-error">{error}</p>}
    </Dialog>
  );
}
