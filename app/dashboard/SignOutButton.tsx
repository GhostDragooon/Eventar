'use client';
import { useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await supabaseBrowser().auth.signOut();
          window.location.href = '/login';
        })
      }
      className="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
    >
      {pending ? '…' : 'Sign out'}
    </button>
  );
}
