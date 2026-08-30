'use client';

/**
 * Overlaps components/dialogs/SubscriptionDialog.tsx (Category 06) in
 * intent — both collect an email for "get updates". Kept separate on
 * purpose: this one morphs an inline pill into an inline form (for a page
 * section), SubscriptionDialog is a modal (for an interrupting flow). Flagged
 * for Ivan rather than merged — no live feature needs either yet, so there's
 * no evidence which shape the real one should take.
 */

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type SignupResult = { ok: true } | { error: string };

export function NotificationSignupButton({ onSubscribe }: { onSubscribe: (email: string) => Promise<SignupResult> }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const emailId = useId();

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus('Enter a valid email address.');
      return;
    }
    setPending(true);
    setStatus(null);
    const result = await onSubscribe(email);
    setPending(false);
    setStatus('error' in result ? result.error : 'Subscribed.');
  }

  if (!expanded) {
    return (
      <Button type="button" onClick={() => setExpanded(true)} className="gap-xs">
        <span className="material-symbols-outlined" aria-hidden>notifications</span>
        Get updates
      </Button>
    );
  }

  return (
    <div className="flex max-w-lg flex-wrap items-center gap-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest p-sm">
      <label htmlFor={emailId} className="sr-only">Email address</label>
      <Input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="min-h-11 min-w-52 flex-1" />
      <Button type="button" disabled={pending} onClick={submit}>{pending ? 'Submitting…' : 'Subscribe'}</Button>
      <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Close signup" onClick={() => setExpanded(false)}>
        <span className="material-symbols-outlined" aria-hidden>close</span>
      </Button>
      {status && <p role={status === 'Subscribed.' ? 'status' : 'alert'} className={status === 'Subscribed.' ? 'w-full text-success' : 'w-full text-error'}>{status}</p>}
    </div>
  );
}
