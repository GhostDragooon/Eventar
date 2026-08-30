'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export type InvitationDraft = { email: string; role: string; message: string };
export type InvitationResult = { ok: true } | { error: string };

export function TeammateInvitationForm({
  roles,
  onInvite,
}: {
  roles: readonly { value: string; label: string }[];
  onInvite: (draft: InvitationDraft) => Promise<InvitationResult>;
}) {
  const [draft, setDraft] = useState<InvitationDraft>({ email: '', role: '', message: '' });
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const emailId = useId();
  const messageId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(draft.email) || !draft.role) {
      setStatus({ kind: 'error', message: 'Enter a valid email and select a role.' });
      return;
    }
    setPending(true);
    setStatus(null);
    const result = await onInvite(draft);
    setPending(false);
    setStatus('error' in result ? { kind: 'error', message: result.error } : { kind: 'success', message: 'Invitation sent.' });
  }

  return (
    <form onSubmit={submit} className="space-y-md">
      <div className="space-y-xs">
        <label htmlFor={emailId} className="text-on-surface">Email address</label>
        <Input id={emailId} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="min-h-11" />
      </div>
      <div className="space-y-xs">
        <span className="text-on-surface">Role</span>
        <Select value={draft.role} onValueChange={(value) => setDraft({ ...draft, role: String(value) })}>
          <SelectTrigger className="min-h-11 w-full border-outline-variant bg-surface-container-lowest">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-xs">
        <label htmlFor={messageId} className="text-on-surface">Message <span className="text-on-surface-variant">Optional</span></label>
        <Textarea id={messageId} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} rows={4} />
      </div>
      <Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      {status && (
        <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'rounded-[12px] bg-error-container p-md text-on-error-container' : 'rounded-[12px] bg-success-container p-md text-on-success-container'}>
          {status.message}
        </p>
      )}
    </form>
  );
}
