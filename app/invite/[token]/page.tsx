'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SiteShell } from '@/components/shell/SiteShell';
import { acceptInvite } from './actions';

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ kind: 'success'; orgName: string } | { kind: 'error'; message: string } | null>(null);

  async function handleAccept() {
    setPending(true);
    setResult(null);
    const res = await acceptInvite(token);
    setPending(false);
    if ('error' in res) {
      setResult({ kind: 'error', message: res.error });
    } else {
      setResult({ kind: 'success', orgName: res.orgName });
    }
  }

  if (result?.kind === 'success') {
    return (
      <SiteShell active="home">
        <div className="mx-auto max-w-md px-md py-2xl text-center">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-xl shadow-sm">
            <span className="material-symbols-outlined text-[48px] text-primary mb-md" aria-hidden>check_circle</span>
            <h1 className="font-headline-md text-headline-md text-on-surface mb-sm">You're in!</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg">
              You've joined <strong>{result.orgName}</strong>.
            </p>
            <Button onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
          </div>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell active="home">
      <div className="mx-auto max-w-md px-md py-2xl text-center">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-xl shadow-sm">
          <span className="material-symbols-outlined text-[48px] text-primary mb-md" aria-hidden>group_add</span>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-sm">Join your team</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg">
            You've been invited to join an organisation on Eventar. Click below to accept.
          </p>
          <Button onClick={handleAccept} disabled={pending} className="w-full">
            {pending ? 'Joining…' : 'Accept invite'}
          </Button>

          {result?.kind === 'error' && (
            <p role="alert" className="mt-md rounded-xl bg-error-container p-md text-on-error-container text-body-md">
              {result.message}
            </p>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
