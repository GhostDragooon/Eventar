'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

/** `signOut` resolves to an error message to show, or null when it has left the page (see lib/signOut.ts). */
export function SignOutAction({ signOut }: { signOut: () => Promise<string | null> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setError(await signOut());
          })
        }
        className="min-h-11 font-label-md text-label-md"
      >
        <span className="material-symbols-outlined mr-xs align-middle text-[18px]" aria-hidden>logout</span>
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error && (
        <p role="alert" className="mt-sm font-body-md text-body-md text-error m-0">
          {error}
        </p>
      )}
    </>
  );
}
