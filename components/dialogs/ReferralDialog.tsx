'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export type ReferralDraft = { email: string; consent: boolean };

export function ReferralDialog({
  open,
  onOpenChange,
  onReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: (draft: ReferralDraft) => void;
}) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();

  function prepare() {
    if (!/^\S+@\S+\.\S+$/.test(email) || !consent) {
      setError('Enter a valid email and confirm consent.');
      return;
    }
    setError(null);
    onReady({ email, consent });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare referral"
      description="This dialog prepares the referral. The host controls delivery."
      footer={<Button type="button" onClick={prepare}>Prepare</Button>}
    >
      <div className="space-y-md">
        <div className="space-y-xs">
          <label htmlFor={emailId} className="text-on-surface">Recipient email</label>
          <Input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11" />
        </div>
        <label className="flex items-start gap-md">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-xs size-5 accent-primary" />
          <span className="text-on-surface-variant">I confirm that the approved referral consent requirements have been met.</span>
        </label>
        {error && <p role="alert" className="text-error">{error}</p>}
      </div>
    </Dialog>
  );
}
