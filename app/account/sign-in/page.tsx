'use client';

// Attendee sign-in — same Auth 3 backdrop shell as organiser /login.
// Differences: no ControlledAccessNotice; sendAttendeeMagicLink; attendee copy.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendAttendeeMagicLink } from './actions';
import { AuthBackdropCard } from '@/components/auth/AuthBackdropCard';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { resolveAuthError } from '@/components/auth/auth-error-messages';
import { attendeeNextPath } from './attendeeNext';
import { checkDoorSession } from '@/lib/doorSession';

export default function AttendeeSignInPage() {
  return (
    <Suspense fallback={<AttendeeSignInShell />}>
      <AttendeeSignInForm />
    </Suspense>
  );
}

function AttendeeSignInShell({ children }: { children?: React.ReactNode } = {}) {
  return <AuthBackdropCard door="attendee">{children}</AuthBackdropCard>;
}

function AttendeeSignInForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlErrorCode = searchParams.get('error');
  const urlErr = resolveAuthError(urlErrorCode, 'attendee');
  const next = attendeeNextPath(searchParams.get('next')) ?? undefined;

  const [sessionKnown, setSessionKnown] = useState(() => Boolean(urlErrorCode));
  const [endedErr, setEndedErr] = useState<string | null>(null);
  useEffect(() => {
    if (urlErrorCode) return;
    let cancelled = false;
    (async () => {
      const session = await checkDoorSession();
      if (cancelled) return;
      if (session === 'signed_in') {
        router.replace(next ?? '/account/record');
        return;
      }
      if (session === 'ended') setEndedErr(resolveAuthError('session_ended', 'attendee'));
      setSessionKnown(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next, urlErrorCode]);

  if (!sessionKnown) {
    return <AttendeeSignInShell />;
  }

  return (
    <AttendeeSignInShell>
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
        <span className="text-[color:var(--on-primary-container)]">Attendee</span>
        <span className="text-on-surface-variant"> · Sign in</span>
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Sign in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        New user?{' '}
        <Link
          href="/account/sign-up"
          className="font-semibold text-[color:var(--on-primary-container)] hover:underline"
        >
          Create an account
        </Link>
        . We&apos;ll email a one-time link — no password.
      </p>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        Guest registration still works without an account. This door is for linking past
        registrations, your profile, and held CME/CPD points.
      </p>
      <MagicLinkSignInForm
        submitMagicLink={sendAttendeeMagicLink}
        initialError={urlErr ?? endedErr}
        placeholder="you@example.com"
        submitLabel="Continue"
        next={next}
        audience="attendee"
      />

      {/* TODO(auth-sso): same slot as organiser when enabled */}

      <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant text-center m-0">
        The link expires after 15 minutes and works once.
      </p>

      <details className="group">
        <summary className="cursor-pointer font-body-md text-body-md text-[color:var(--on-primary-container)] hover:underline list-none">
          Trouble signing in?
        </summary>
        <ul className="mt-sm font-body-md text-[calc(13px*var(--text-scale))] text-on-surface-variant leading-relaxed list-disc pl-lg flex flex-col gap-xs">
          <li>Links expire after 15 minutes and work once — request a fresh one above.</li>
          <li>Check spam, and make sure you opened the newest email.</li>
          <li>
            Open the link in the same browser you asked for it in. A link opened on another device,
            or inside a mail app&apos;s built-in browser, won&apos;t sign you in.
          </li>
          <li>
            Use the same address you registered with — we look up the account by that address.
          </li>
          <li>
            Link never arrives? Try another browser, or ask the event organiser about your
            registration.
          </li>
          <li>
            Lost the inbox entirely? We can&apos;t recover a magic-link account from this screen.
            Contact the event organiser.
          </li>
        </ul>
      </details>
    </AttendeeSignInShell>
  );
}
