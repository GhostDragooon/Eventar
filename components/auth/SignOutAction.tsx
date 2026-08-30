'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function SignOutAction({ signOut }: { signOut: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(signOut)}
      className="min-h-11 font-label-md text-label-md"
    >
      <span className="material-symbols-outlined mr-xs align-middle text-[18px]" aria-hidden>logout</span>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
