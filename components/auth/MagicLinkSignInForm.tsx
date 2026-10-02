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
  /**
   * Optional post-sign-in destination the caller wants to round-trip through
   * OTP. Rendered as a hidden field so the Server Action can read it from
   * formData; the callback route validates it (same guard as the raw
   * `?next=` param on `/auth/callback`). Omit and the action falls back to
   * its own default destination.
   */
  next?: string;
  /**
   * Which surface is rendering this form. Only difference today is the
   * help-text sentence under the input — organizer references an allowlist,
   * attendee cannot (self-serve sign-up), and an invitee is not on any list
   * yet: accepting the invite is what puts them on one. Default preserves
   * organizer copy so existing callers stay identical.
   */
  audience?: 'organizer' | 'attendee' | 'invitee';
};

export function MagicLinkSignInForm({
  submitMagicLink,
  initialError = null,
  placeholder = 'you@company.com',
  submitLabel = 'Send magic link',
  next,
  audience = 'organizer',
}: Props) {
  const [pending, startTransition] = useTransition();
  // The error the page arrived with (an expired link, a failed role check) sits
  // above the form, where it is seen before the field it asks you to use again;
  // it used to render after the submit button, below the fold on a laptop
  // (Band 1 review F4). What a submit returns still lands under the button.
  const [notice, setNotice] = useState<AuthStatus | null>(
    initialError ? { kind: 'error', message: initialError } : null,
  );
  const [status, setStatus] = useState<AuthStatus | null>(null);

  function submit(formData: FormData) {
    setNotice(null);
    setStatus(null);
    // The field clears when the action completes; naming the address lets a
    // mistyped one be spotted instead of waiting for an email that never comes.
    const sentTo = String(formData.get('email') ?? '').trim();
    startTransition(async () => {
      const result = await submitMagicLink(formData);
      setStatus(
        'error' in result
          ? { kind: 'error', message: result.error }
          : {
              kind: 'success',
              message: sentTo ? `Check your inbox (${sentTo}) for a sign-in link.` : 'Check your inbox for a sign-in link.',
            },
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
      {notice && <AuthStatusMessage status={notice} />}
      {next && <input type="hidden" name="next" value={next} />}
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
        Eventar will send a one-time sign-in link.{' '}
        {audience === 'attendee'
          ? 'The response does not reveal whether an account already exists.'
          : audience === 'invitee'
            ? 'Use the address you want for your organiser account.'
            : 'The response does not reveal whether an address is on the organizer list.'}
      </p>
      {/* text-on-primary!: tailwind-merge reads `text-label-md` (a font size) as
          a text colour and drops the Button's own text-on-primary, leaving dark
          text on the blue fill (3.82:1, and 1.96:1 in dark). Remove the `!` when
          cn() learns the type scale (G1 token sweep). */}
      <Button type="submit" disabled={pending} className="min-h-11 w-full font-label-md text-label-md text-on-primary!">
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>mail</span>
        {pending ? 'Sending…' : submitLabel}
      </Button>
      {status && <AuthStatusMessage status={status} />}
    </form>
  );
}
