'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthStatusMessage, type AuthStatus } from './AuthStatusMessage';

export type MagicLinkResult = { ok: true } | { error: string };

type Props = {
  submitMagicLink: (formData: FormData) => Promise<MagicLinkResult>;
  initialError?: string | null;
  placeholder?: string;
  submitLabel?: string;
};

export function MagicLinkSignInForm({
  submitMagicLink,
  initialError = null,
  placeholder = 'you@company.com',
  submitLabel = 'Send magic link',
}: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<AuthStatus | null>(
    initialError ? { kind: 'error', message: initialError } : null,
  );

  function submit(formData: FormData) {
    setStatus(null);
    startTransition(async () => {
      const result = await submitMagicLink(formData);
      setStatus(
        'error' in result
          ? { kind: 'error', message: result.error }
          : { kind: 'success', message: 'Check your inbox for a sign-in link.' },
      );
    });
  }

  // No `noValidate` on the form: the browser's own constraint check on a
  // required type="email" field is the first of the three validation layers
  // and stops empty/malformed addresses before any network call. The Server
  // Action re-validates regardless — this layer is an affordance, not the
  // guarantee.
  return (
    <form action={submit} className="space-y-md">
      <label className="block space-y-xs">
        <span className="font-label-md text-label-md text-on-surface">Email address</span>
        {/* The field announces itself: 2px accent border + soft accent halo
            (ring-4 = the same 4px spread the halo always was, now off tokens). */}
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={placeholder}
          required
          disabled={pending}
          aria-describedby="magic-link-help"
          className="min-h-11 border-2 border-on-primary-container ring-4 ring-primary/8"
        />
      </label>
      <p id="magic-link-help" className="font-body-md text-body-md text-on-surface-variant">
        Eventar will send a one-time sign-in link. The response does not reveal whether an address is on the staff list.
      </p>
      <Button type="submit" disabled={pending} className="min-h-11 w-full font-label-md text-label-md">
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>mail</span>
        {pending ? 'Sending…' : submitLabel}
      </Button>
      {status && <AuthStatusMessage status={status} />}
    </form>
  );
}
