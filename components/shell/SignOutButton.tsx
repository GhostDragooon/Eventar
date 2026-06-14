'use client';
import { useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export function SignOutButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await supabaseBrowser().auth.signOut();
          window.location.href = '/login';
        })
      }
      className={className}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
